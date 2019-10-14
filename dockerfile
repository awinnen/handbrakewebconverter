FROM node:12-stretch-slim

RUN apt update 
RUN apt upgrade -y
RUN apt install handbrake handbrake-cli -y

RUN mkdir /mnt/handbrakewebconverter

COPY converter/ /mnt/handbrakewebconverter/converter
COPY package.json /mnt/handbrakewebconverter/package.json
COPY package-lock.json /mnt/handbrakewebconverter/package-lock.json

WORKDIR "/mnt/handbrakewebconverter"
RUN npm ci

EXPOSE 3000
ENTRYPOINT ["node", "converter/index.js"]