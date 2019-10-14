'use strict';
const debug = require('debug')('handbrakewebconverter');
const express = require('express');
const fs = require('fs-extra');
const logger = require('morgan');
const bodyParser = require('body-parser');
const formidableMiddleware = require('express-formidable');
const cors = require('cors');
const path = require('path');
const handbrake = require('handbrake-js');
const generateUUID = require('uuid/v1');
const urljoin = require('url-join');

const tmpUploadDir = "/tmp/";
const videoDir = "/handbrakewebconverter";
fs.ensureDirSync(tmpUploadDir);

const app = express();
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(formidableMiddleware({
	encoding: 'utf-8',
	uploadDir: tmpUploadDir,
	multiples: false
}));
app.use(cors());

app.get("/", (req, res) => {
	res.sendFile(`${__dirname}/index.html`);
});

app.get('/jobs/:id/:preset/:filename', function (req, res, next) {
	const job = req.params.id;
	const preset = req.params.preset;
	const filename = req.params.filename;
	return res.download(path.resolve(getJobDirectory(job), preset, filename));
});

app.get('/presets', (req, res, next) => {
	handbrake.exec({ "preset-list": true }, (err, stdout, stderr) => {
		if (err) {
			return next("Error generating Presets", stderr, 500);
		}

		const outputStr = stdout.match(/^\s+$/gm) ? stderr : stdout;
		const regEx = /^ {4}(\w[\w ]*)$/gm;
		console.log(outputStr);
		let match = regEx.exec(outputStr);
		const result = [];
		while (match !== null) {
			result.push(match[1]);
			match = regEx.exec(outputStr);
		}
		return res.json(result);
	})
});

app.post("/convert", (req, res, next) => {
	if (Object.keys(req.files).length === 0) {
		return next(createError('No files were uploaded.', null, 400));
	} else if (Object.keys(req.files).length > 1) {
		return next(createError('More than one file uploaded. You must upload one video file', null, 400));
	} else if (!req.fields.preset) {
		return next(createError('No preset specified. You need to specify an handbrake preset. Call GET /presets to get a list of available presets', null, 400));
	}

	const presets = req.fields.preset.split(',').map(p => p.trim());
	const video = Object.values(req.files)[0];

	const jobId = generateUUID();

	return createJobDirectory(jobId).then(encPath => {
		const originalPath = path.resolve(encPath, "Original", video.name);
		fs.ensureDirSync(path.resolve(encPath, "Original"));
		fs.copyFileSync(video.path, originalPath);
		fs.removeSync(path.resolve(video.path));

		const tasks = presets.map(preset => {
			const outputPath = path.resolve(encPath, preset, video.name);
			fs.ensureDirSync(path.resolve(encPath, preset));
			return {
				input: originalPath,
				output: outputPath,
				preset: preset,
				rotate: 1,
				downloadUrl: urljoin("/", "jobs", jobId, preset, video.name)
			};
		})

		Promise.all(tasks.map(taskInfo => transcodeWithPreset(taskInfo))).then(results => {
			return res.json(generateResult([{ preset: "Original", path: urljoin("/", "jobs", jobId, "Original", video.name) }, ...results]));
		}, error => {
			return next(createError("Error encorind videos", error, 500));
		})
	}, err => {
		return next(createError("Error creating temporary path", err, 500));
	});
});

function generateResult(videos) {
	const result = {};
	videos.forEach(v => {
		result[v.preset] = v.path
	});
	return result;
}

function transcodeWithPreset({ input, output, preset, downloadUrl }) {
	return new Promise((resolve, reject) => {
		handbrake.spawn({
			input: input,
			output: output,
			preset: preset,
		}).on('begin', () => {
			debug("Starting Encode")
		})
			.on('progress', evt => {
				debug(evt);
			})
			.on('error', (err) => {
				reject(err);
			})
			.on('output', debug)
			.on('complete', evt => {
				debug(output + " completed");
			})
			.on('end', () => {
				resolve({ preset: preset, path: downloadUrl });
			})
	});
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	const err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use((err, req, res, next) => {
		res.status(err.status || 500).json({
			message: err.message,
			error: err,
			node_version: process.version
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
	return res.status(err.status || 500).json({
		message: err.message,
		error: {},
		node_version: process.version
	});
});

app.set('port', process.env.PORT || 3000);
process.on('uncaughtException', (ex) => {
	debug(ex);
});
const server = app.listen(app.get('port'), () => {
	debug('Express server listening on port ' + server.address().port);
});

function createError(message, object, status) {
	const err = new Error(message);
	Object.assign(err, object || {});
	err.status = status || 500;
	return err;
}

function createJobDirectory(uuid) {
	const directory = getJobDirectory(uuid);
	return fs.ensureDir(directory).then(() => directory);
}

function getJobDirectory(uuid) {
	return path.resolve(videoDir, 'jobs', uuid);
}