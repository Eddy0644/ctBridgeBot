const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const FileBox = require("file-box").FileBox;
let env;

async function uploadWebp(filename) {
    const {secret} = env;
    // Orig: version 20230606 from ctBridge
    return new Promise(async (resolve) => {
        const {password, webFilePathPrefix, operatorName, urlPrefix, urlPathPrefix} = secret.upyun;
        const generateAPIKey = (password) => crypto.createHash('md5').update(password).digest('hex');
        const generateSignature = (apiKey, signatureData) => {
            const hmac = crypto.createHmac('sha1', apiKey);
            hmac.update(signatureData);
            return hmac.digest('base64');
        };
        const getFileContentMD5 = async (filePath2) => {
            const fileContent = fs.readFileSync(filePath2);
            return crypto.createHash('md5').update(fileContent).digest('hex');
        };
        const apiKey = generateAPIKey(password);
        const method = 'PUT';
        const date = new Date().toUTCString(); // Generate UTC timestamp
        const filePathPrefix = `./downloaded/stickerTG/`;
        const filePath = `${webFilePathPrefix}/${filename}`;
        const fileStream = fs.createReadStream(`${filePathPrefix}${filename}`);
        const contentMD5 = await getFileContentMD5(`${filePathPrefix}${filename}`);
        const signatureData = `${method}&${filePath}&${date}&${contentMD5}`;
        const signature = generateSignature(apiKey, signatureData);
        const authHeader = `UPYUN ${operatorName}:${signature}`;
        const requestUrl = `https://v0.api.upyun.com${filePath}`;

        const requestOptions = {
            method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'image/webp',
                'Date': date,
                'Content-MD5': contentMD5,
            }
        };
        const req = https.request(requestUrl, requestOptions, (res) => {
            let data = "";
            res.on('data', (chunk) => {
                data = data + chunk.toString();
            });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({
                        ok: 1,
                        filePath: `${urlPrefix}${urlPathPrefix}/${filename}`,
                        msg: data
                    });
                } else {
                    resolve({
                        ok: 0,
                        msg: `Upyun server returned non-200 response.\n${data}`
                    });
                }
            });
        });
        req.on('error', (e) => {
            resolve({
                ok: 0,
                msg: `Error occurred during upload-to-Upyun request: ${e.toString()}`
            });
        });

        fileStream.pipe(req);
        fileStream.on('end', () => req.end());
    });
}

async function webpToJpg(local_path, rand1) {
    const {defLogger} = env;
    const filename = local_path.replace('./downloaded/stickerTG/', '');
    const uploadResult = await uploadWebp(filename);
    if (uploadResult.ok) {
        await FileBox.fromUrl(uploadResult.filePath + '!/format/jpg').toFile(`./downloaded/stickerTG/${rand1}.jpg`);
        return local_path.replace('.webp', '.jpg');
    } else {
        defLogger.warn(`Error on .webp-to-.jpg pre-process:\n\t${uploadResult.msg}`);
        return local_path;
    }
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {
        // uploadWebp,
        webpToJpg,
    };
};