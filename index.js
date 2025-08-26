const express = require('express');
const { exec, spawn } = require('child_process');
const http = require('http');
const io = require('socket.io-client');
const { XMLParser } = require('fast-xml-parser');
const fs = require('fs');

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

app.get('/scan-document', async (req, res) => {
    try {
        const result = await scanToBase64(req.body);

        // Можно добавить дополнительную обработку
        res.setHeader('Content-Type', 'application/json');
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Сканирование с получением base64
function scanToBase64(options = {}) {
    return new Promise((resolve, reject) => {
        // Параметры по умолчанию
        const {
            resolution = 300,
            mode = 'Color',
            format = 'jpeg',
            device = 'airscan:w1:HP LaserJet Pro MFP M225rdn (13FC45)',
            progressCallback = null,
        } = options;

        // Формируем аргументы для scanimage
        const args = [
            `--format=${format}`,
            `--resolution=${resolution}`,
            `--mode=${mode}`,
            '--progress', // Включаем вывод прогресса
        ];

        // Добавляем устройство, если указано
        if (device) {
            args.push(`--device-name=${device}`);
        }

        console.log('Запуск сканирования с параметрами:', args);

        // Запускаем процесс сканирования
        const scan = spawn('scanimage', args);

        let imageBuffer = Buffer.alloc(0);
        let errorOutput = '';

        // Собираем данные изображения из stdout
        scan.stdout.on('data', (chunk) => {
            imageBuffer = Buffer.concat([imageBuffer, chunk]);
        });

        // Обрабатываем stderr (прогресс и ошибки)
        scan.stderr.on('data', (data) => {
            const output = data.toString();
            errorOutput += output;

            // Парсим прогресс
            const progressMatch = output.match(/(\d+\.?\d*)%/);
            if (progressMatch && progressCallback) {
                const progress = parseFloat(progressMatch[1]);
                progressCallback(progress);
            }

            // Выводим отладочную информацию
            console.log('SANE:', output.trim());
        });

        // Обрабатываем завершение процесса
        scan.on('close', (code) => {
            if (code === 0) {
                if (imageBuffer.length > 0) {
                    // Конвертируем в base64
                    const base64Image = imageBuffer.toString('base64');

                    resolve({
                        success: true,
                        image: base64Image,
                        format: `image/${format}`,
                        size: imageBuffer.length,
                        mimeType: `image/${format}`,
                    });
                } else {
                    reject(new Error('Нет данных изображения'));
                }
            } else {
                reject(new Error(`Сканирование завершилось с ошибкой (код ${code}): ${errorOutput}`));
            }
        });

        // Обрабатываем ошибки запуска процесса
        scan.on('error', (error) => {
            reject(new Error(`Ошибка запуска scanimage: ${error.message}`));
        });
    });
}
