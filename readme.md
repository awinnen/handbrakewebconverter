# handbreakwebconverter

Easy to use video converter.


# Endpoints

|path            |        Usage                  |
|----------------|-------------------------------|
|/               |Index with demo page
|/convert          |Post video and presets as multipart-formdata keys: movie, preset            |
|/jobs/:id/:preset/:filename          |download converted video|
|/presets      | List all available presets

# How to convert
![Example using POSTMAN](../POST%20example.png)