const express = require('express');
const { exec, spawn } = require('child_process');
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
    const scan = spawn('scanimage', [
        '-d "airscan:wl:HP LaserJet Pro MFP M225rdn (13FC45)"',
        '--format=jpeg',
        '--resolution=300',
        '--mode=Color',
        '--progress',
    ]);

    const writeStream = fs.createWriteStream(outputPath);

    scan.stdout.pipe(writeStream);

    scan.stderr.on('data', (data) => {
        console.log('Прогресс:', data.toString());
    });

    scan.on('close', (code) => {
        if (code === 0) {
            resolve(outputPath);
        } else {
            reject(new Error(`Сканирование завершилось с кодом ${code}`));
        }
    });

    scan.on('error', reject);
});
