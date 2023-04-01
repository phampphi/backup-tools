import cron from 'node-cron';
import mysqldump from 'mysqldump';
import { Storage, IdempotencyStrategy } from '@google-cloud/storage';
import fs from 'fs';
import zlib from 'zlib';
import dayjs from 'dayjs';

const BUCKETNAME = process.env.BUCKETNAME;

async function backup(dbname) {
    const filename = `${dbname}-${dayjs().format('YYYYMMDDHHmm')}.sql`;
    const path = `/tmp/${filename}`;

    try {
        console.log(`DB backup ${dbname} - Starting`);
        await mysqldump({
            connection: {
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: dbname
            },
            dumpToFile: path,
        });
        console.log(`DB backup ${dbname} - Created ${path}`);

        const zipFIle = await compressFile(path);
        console.log(`DB backup ${dbname} - Created zip ${zipFIle}`);

        await uploadGCP(zipFIle, `${filename}.gz`);
        console.log(`DB backup ${dbname} - ${filename} uploaded to ${BUCKETNAME}`);

        fs.unlink(path, (err) => { (!err) ? console.log(`DB backup ${dbname} - Completed`) : console.log(`DB backup ${dbname} - Error`, err); });
    }
    catch (e) {
        console.log(e);
    }
}

const storage = new Storage({
    keyFilename: "gcp-storage-upload.json",
    retryOptions: {
        autoRetry: true,

    }
});
const uploadGCP = async (filePath, fileName) => {
    const options = {
        destination: fileName,
        // The multiplier to increase the delay time between the completion of failed requests, and the initiation of the subsequent retrying request
        retryDelayMultiplier: 3,
        // The total time between an initial request getting sent and its timeout.
        totalTimeout: 500,
        // The maximum delay time between requests. When this value is reached, retryDelayMultiplier will no longer be used to increase delay time.
        maxRetryDelay: 60,
        // The maximum number of automatic retries attempted before returning the error.
        maxRetries: 5,
        idempotencyStrategy: IdempotencyStrategy.RetryAlways,
    };

    await storage.bucket(BUCKETNAME).upload(filePath, options);
}

const compressFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const read = fs.createReadStream(filePath);
        const zip = zlib.createGzip();
        const write = fs.createWriteStream(`${filePath}.gz`);
        read.pipe(zip).pipe(write);

        write.on(
            'error', err => {
                write.end();
                reject(err);
            },
        );
        write.on('finish', () => {
            resolve(`${filePath}.gz`);
        });
    });
}

async function deleteOldBackupFiles(prefix, delimiter) {
    const options = {
        prefix: prefix,
    };
    if (delimiter) {
        options.delimiter = delimiter;
    }

    // Lists files in the bucket, filtered by a prefix
    const [files] = await storage.bucket(BUCKETNAME).getFiles(options);
    const max = process.env.MAX_RETAINED_BACKUP || 10;
    if (files.length > max) {
        console.log('Removing old backup files:');
        files.sort();

        for (let i = 0; i < files.length - max; i++) {
            await storage.bucket(BUCKETNAME).file(files[i].name).delete();
            console.log(`${BUCKETNAME}/${files[i].name} deleted`);
        }
    }
}

(async () => {
    console.log('db-tools started');
    cron.schedule(process.env.CRON, async () => {
        console.log('running db back up tasks');
        try {
            for (const dbname of process.env.DB_NAMES.split(',')) {
                await backup(dbname);
                await deleteOldBackupFiles(dbname)
            }
        }
        catch (e) {
            console.error(e);
        }
    }, {
        timezone: 'australia/melbourne'
    });
})();