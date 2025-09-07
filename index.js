const express = require('express');
const { exec, spawn } = require('child_process');
const http = require('http');
const io = require('socket.io-client');
const { XMLParser } = require('fast-xml-parser');
const fs = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);
require('dotenv').config();

const socketRegulaUrl = process.env.REGULA_SOCKET_URL;
const appPort = process.env.APP_PORT;
const scanWebcamName = process.env.SCAN_WEBCAM_NAME;
const scannerDeviceIds = process.env.SCANNER_DEVICE_IDS?.split(/,,/g) || [];
const scannerDeviceResolution = process.env.SCANNER_DEVICE_RESOLUTION;

// new parser instance
const parser = new XMLParser();

const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console(), new winston.transports.File({ filename: 'logs/app.log' })],
});

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
app.listen(appPort, () => {
    logger.info(`Сервер запущен на http://localhost:${appPort}/`);
});

try {
    if (socketRegulaUrl != null && socketRegulaUrl !== '') {
        // Получаем сокет от сканеру Regula
        let socket = io(socketRegulaUrl, {
            transports: ['websocket'],
        });

        // Подключаемся к сканеру, получаем socket.id
        socket.on('connect', () => {
            logger.info('socket id: ', socket.id);
        });
    }
} catch (error) {
    logger.info('socket regula: error', error);
}

//Метод получения изображения
app.get('/scan-regula', (req, res) => {
    logger.info('start scan-regula');

    let responseSent = false;
    const timeout = setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            socket.off('OnProcessingFinished');
            res.status(500).json({
                success: false,
                error: 'Timeout: No response received within 60 seconds',
            });
            logger.info('timeout scan-regula');
        }
    }, 60000);

    const cleanup = () => {
        clearTimeout(timeout);
        responseSent = true;
    };

    socket.once('OnProcessingFinished', (result) => {
        if (responseSent) return;

        socket.emit('IsReaderResultTypeAvailable', eRPRM_ResultType.RPRM_ResultType_RawImage, (count) => {
            if (responseSent) return;

            logger.info(`Доступно изображений: ${count}`);
            if (count <= 0) {
                cleanup();
                res.sendStatus(404);
                logger.info(`scan-regula нет картинок`);
                return;
            }

            socket.emit('GetReaderFileImage', 1, (data) => {
                if (responseSent) return;

                cleanup();
                if (data != null) {
                    const jsonContent = JSON.stringify({
                        success: true,
                        image: Buffer.from(data.result, 'binary').toString('base64'),
                    });
                    res.end(jsonContent);
                    logger.info(`scan-regula: ответ true`);
                } else {
                    res.status(500).json({ success: false, error: 'No data received' });
                    logger.info(`scan-regula ошибка в данных`);
                }
            });
        });
    });

    socket.emit('GetImages', debugCb);
});

app.get('/scan-document', async (req, res) => {
    logger.info('scan-document: start');
    try {
        const result = await scanToBase64(req.body);

        // Можно добавить дополнительную обработку
        res.setHeader('Content-Type', 'application/json');
        res.json(result);
        logger.info('scan-document: finish');
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
        logger.info('scan-document: error', error);
    }
});

app.get('/scan-webcam', async (req, res) => {
    logger.info('scan-webcam: start');
    try {
        const format = 'jpg';
        captureScreenshotBase64()
            .then((base64) => {
                // Можно добавить дополнительную обработку
                res.setHeader('Content-Type', 'application/json');
                res.json({
                    success: true,
                    image: base64,
                    format: `image/${format}`,
                    size: base64.length,
                    mimeType: `image/${format}`,
                });
                logger.info('scan-webcam: finish');
            })
            .catch((error) => {
                res.status(500).json({
                    success: false,
                    error: error.message,
                });
                logger.info('scan-webcam captureScreenshotBase64: error', error);
            });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
        logger.info('scan-webcam: error', error);
    }
});

async function captureScreenshotBase64() {
    logger.info('captureScreenshotBase64: start');
    const tempFile = `screenshot_${Date.now()}.jpg`;

    try {
        // Захватываем скриншот
        await execAsync(`ffmpeg -f avfoundation -framerate 30 -i "${scanWebcamName}" -frames:v 1 -q:v 2 ${tempFile}`);

        // Читаем файл и конвертируем в base64
        const imageBuffer = await readFileAsync(tempFile);
        const base64Image = imageBuffer.toString('base64');

        // Удаляем временный файл
        await unlinkAsync(tempFile);

        return `data:image/jpeg;base64,${base64Image}`;
    } catch (error) {
        // Удаляем временный файл в случае ошибки
        if (fs.existsSync(tempFile)) {
            await unlinkAsync(tempFile);
        }
        logger.info('captureScreenshotBase64: error', error);
        throw error;
    }
}

// Сканирование с получением base64
function scanToBase64(options = {}) {
    logger.info('scanToBase64: start');
    return new Promise(async (resolve, reject) => {
        const {
            resolution = scannerDeviceResolution,
            mode = 'Color',
            format = 'jpeg',
            device = [],
            progressCallback = null,
            timeout = 30000, // 30 секунд таймаут
        } = options;

        try {
            let deviceIds = device.length > 0 ? device : scannerDeviceIds;
            const existsDevices = await getScannerDevices();
            let targetDevice = '';
            deviceIds.forEach((d) => {
                if (existsDevices.includes(d)) {
                    targetDevice = d;
                }
            });
            logger.info('targetDevice', targetDevice);
            const args = [`--format=${format}`, `--resolution=${resolution}`, `--mode=${mode}`, '--progress'];

            if (targetDevice) {
                args.push(`--device-name=${targetDevice}`);
            }

            logger.info('Запуск сканирования с параметрами:', args);

            const scan = spawn('scanimage', args);
            let imageBuffer = Buffer.alloc(0);
            let errorOutput = '';
            let isCompleted = false;

            // Таймаут для сканирования
            const timeoutId = setTimeout(() => {
                if (!isCompleted) {
                    scan.kill('SIGTERM');
                    reject(new Error('Таймаут сканирования'));
                }
            }, timeout);

            scan.stdout.on('data', (chunk) => {
                imageBuffer = Buffer.concat([imageBuffer, chunk]);
            });

            scan.stderr.on('data', (data) => {
                const output = data.toString();
                errorOutput += output;

                const progressMatch = output.match(/(\d+\.?\d*)%/);
                if (progressMatch && progressCallback) {
                    const progress = parseFloat(progressMatch[1]);
                    progressCallback(progress);
                }

                logger.info('SANE:', output.trim());
            });

            scan.on('close', (code) => {
                clearTimeout(timeoutId);
                isCompleted = true;

                if (code === 0) {
                    if (imageBuffer.length > 0) {
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
                    // Более детальный анализ ошибки
                    let errorMessage = `Код ошибки: ${code}`;

                    if (errorOutput.includes('Invalid argument')) {
                        errorMessage = 'Неверные параметры устройства или сканирования';
                    } else if (errorOutput.includes('Device busy')) {
                        errorMessage = 'Устройство занято';
                    } else if (errorOutput.includes('No device available')) {
                        errorMessage = 'Устройство недоступно';
                    }

                    reject(new Error(`Сканирование не удалось: ${errorMessage}. Детали: ${errorOutput}`));
                }
            });

            scan.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(new Error(`Ошибка запуска scanimage: ${error.message}`));
            });
        } catch (error) {
            reject(error);
        }
    });
}

function getScannerDevices() {
    logger.info('getScannerDevices: start');
    return new Promise((resolve, reject) => {
        const scan = spawn('scanimage', ['-L']);
        let output = '';

        scan.stdout.on('data', (data) => (output += data.toString()));
        scan.stderr.on('data', (data) => (output += data.toString()));

        scan.on('close', (code) => {
            if (code === 0) {
                logger.info(`getScannerDevices: устройство найдено ${output}`);
                resolve(output);
            } else {
                logger.info('getScannerDevices: error ошибка получения устройства');
                reject(new Error(`Ошибка получения устройств: ${output}`));
            }
        });

        scan.on('error', reject);
    });
}
