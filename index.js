const express = require('express');
const http = require('http');
const io = require('socket.io-client');
const { XMLParser } = require('fast-xml-parser');
const sane = require('sane');

const url = 'http://localhost:3000/';
// new parser instance
const parser = new XMLParser();

let jsonObj = {};

var eRPRM_ResultType = {
    RPRM_ResultType_Empty: 0,
    RPRM_ResultType_RawImage: 1,
    RPRM_ResultType_FileImage: 2,
    RPRM_ResultType_MRZ_OCR_Extended: 3,
    RPRM_ResultType_BarCodes: 5,
    RPRM_ResultType_Graphics: 6,
    RPRM_ResultType_MRZ_TestQuality: 7,
    RPRM_ResultType_DocumentTypesCandidates: 8,
    RPRM_ResultType_ChosenDocumentTypeCandidate: 9,
    RPRM_ResultType_DocumentsInfoList: 10,
    RPRM_ResultType_OCRLexicalAnalyze: 15,
    RPRM_ResultType_RawUncroppedImage: 16,
    RPRM_ResultType_Visual_OCR_Extended: 17,
    RPRM_ResultType_BarCodes_TextData: 18,
    RPRM_ResultType_BarCodes_ImageData: 19,
    RPRM_ResultType_Authenticity: 20,
    RPRM_ResultType_EOSImage: 23,
    RPRM_ResultType_BayerImage: 24,
    RPRM_ResultType_MagneticStripe: 25,
    RPRM_ResultType_MagneticStripe_TextData: 26,
    RPRM_ResultType_FieldFileImage: 27,
};

// Создаем Express-приложение
const app = express();

const debugCb = (reply) => console.log(reply);

// Запускаем сервер на порту 8000
app.listen(8000, () => {
    console.log('Сервер запущен на http://localhost:8000/');
});

// Отправляем сокет на сканер Regula
app.get('/', (req, res) => {
    res.send(socket.id);
});

// Получаем сокет от сканеру Regula
/* let socket = io(url, {
    transports: ['websocket'],
});

// Подключаемся к сканеру, получаем socket.id
socket.on('connect', () => {
    console.log('socket id: ', socket.id);
}); */

//Метод получения изображения
app.get('/GetRegulaImages', (req, res) => {
    socket.once('OnProcessingFinished', (result) => {
        socket.emit('IsReaderResultTypeAvailable', eRPRM_ResultType.RPRM_ResultType_RawImage, (count) => {
            if (count <= 0) {
                res.send(404);
            }
            socket.emit('GetReaderFileImage', 1, (data) => {
                if (data != null) {
                    // console.log(Buffer.from(data.result).toString('base64'));
                    // obj.img.push(Buffer.from(data.result).toString('base64'));
                    const jsonContent = JSON.stringify({ obj: Buffer.from(data.result, 'binary').toString('base64') });
                    res.end(jsonContent);
                    //    res.end(data.result, 'binary');
                }
            });
            // countObj  = count.result;
            // intervalId = setInterval(repeatFunction, 1000);
        });
    });
    socket.emit('GetImages', debugCb);
});

app.get('/GetScannerImage', (req, res) => {
    // Connect to the SANE server
    const context = sane.create();

    // Get a list of available scanners
    const devices = context.getDevices();

    if (devices.length === 0) {
        console.log('No scanners available.');
        return;
    }

    console.log(devices);
    return;

    // Use the first scanner in the list
    const scanner = devices[0];

    // Open the scanner
    const handle = context.open(scanner);

    // Set some options for the scanner
    handle.setOption('mode', 'Color');
    handle.setOption('resolution', 300);
    handle.setOption('format', 'jpeg');
    handle.setOption('device-name', 'genesys:libusb:001:040');

    // Scan the image
    const image = handle.start();
    const imageData = image.read();

    // Save the image to a file
    const fs = require('fs');
    fs.writeFileSync(`scan-${Date.now()}.jpg`, imageData);

    // Close the scanner
    handle.cancel();
});
