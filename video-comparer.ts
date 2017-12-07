import * as ffmpeg from 'fluent-ffmpeg';
import * as blinkDiff from "blink-diff";
import { resolve, basename } from 'path';
import { statSync, existsSync, readdirSync, unlinkSync, rmdirSync, mkdirSync } from 'fs';

export class VideoComparer {
    private _frameStorageFullName: string;
    constructor(private _fullVideoName) { }

    public async compareImageFromVideo(expectedImageFullName: string, tollerance: number = 0.2) {
        let result = false;
        return new Promise(async (accept, reject) => {
            const matches = readdirSync(this._frameStorageFullName)
                .filter(async (file) => {
                    file = resolve(this._frameStorageFullName, file);
                    console.log(file);
                    return await this.compareImages(expectedImageFullName, file, tollerance);
                });

            accept(matches);
        });
    }

    public processVideo(frameStorageFullName) {
        this._frameStorageFullName = frameStorageFullName;
        this.cleanDir(this._frameStorageFullName);
        mkdirSync(this._frameStorageFullName);
        let lastFrameEnqueued = 0;
        const imageName = resolve(this._frameStorageFullName, "test")
        return new Promise<any>((resolve, reject) => {
            ffmpeg(this._fullVideoName)
                .on('error', function (err) {
                    console.log('An error occurred: ' + err.message);
                    reject();
                })
                .on('end', function () {
                    console.log('Processing finished !');
                    resolve();
                })
                .on('progress', function (progress) {
                    lastFrameEnqueued = progress.frames - 1;
                    for (let n = lastFrameEnqueued + 1; n < progress.frames; n++) {
                        console.log(n);
                    }
                })
                .save(`${imageName}%d.png`);
        });
    }

    private async compareImages(actual: string, expected: string, valueThreshold: number = 0.01, typeThreshold = blinkDiff.THRESHOLD_PIXEL) {
        const diff = new blinkDiff({
            imageAPath: actual,
            imageBPath: expected,
            imageOutputLimit: blinkDiff.OUTPUT_ALL,
            thresholdType: typeThreshold,
            threshold: valueThreshold,
            delta: 20,
        });

        return await this.runDiff(diff);
    }

    private runDiff(diffOptions: blinkDiff) {
        return new Promise<boolean>((resolve, reject) => {
            diffOptions.run(function (error, result) {
                if (error) {
                    throw error;
                } else {
                    let message;
                    let resultCode = diffOptions.hasPassed(result.code);
                    if (resultCode) {
                        message = "Screen compare passed!";
                        console.log(message);
                        console.log('Found ' + result.differences + ' differences.');
                        return resolve(true);
                    } else {
                        message = "Screen compare failed!";
                        console.log(message);
                        console.log('Found ' + result.differences + ' differences.');
                        return resolve(false);
                    }
                }
            });
        });
    }

    private cleanDir(dirFullName) {
        if (existsSync(dirFullName)) {
            const pathToFile = dirFullName;
            readdirSync(dirFullName)
                .forEach(file => {
                    const f = resolve(pathToFile, file);
                    if (this.isDirectory(f)) {
                        this.cleanDir(f);
                    }
                    unlinkSync(f);
                });

            rmdirSync(dirFullName);
        }
    }

    private isDirectory(fullName) {
        try {
            if (existsSync(fullName) && statSync(fullName).isDirectory()) {
                return true;
            }
        } catch (e) {
            return false;
        }

        return false;
    }
}
