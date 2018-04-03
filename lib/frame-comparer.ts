import * as ffmpeg from 'fluent-ffmpeg';
import * as blinkDiff from "blink-diff";
import { resolve, basename, extname } from 'path';
import { statSync, existsSync, readdirSync, unlinkSync, rmdirSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { IRectangle } from './interfaces/rectangle';

export class FrameComparer {
    private _frameStorageFullName: string;
    private _frames: Array<string>;

    public async compareImageFromVideo(expectedImageFullName: string, logStorage: string, startRange, endRange, tollerance: number = 0.2, saveActualImageAsExpected: boolean = true, shouldLogImageResults: boolean = false, cropImageRect: IRectangle = undefined, verbose = true): Promise<boolean> {
        if (!saveActualImageAsExpected && !existsSync(expectedImageFullName)) {
            throw new Error(`${expectedImageFullName} is not available!!!`);
        }
        return new Promise<boolean>(async (accept, reject) => {
            endRange = endRange < this._frames.length ? endRange : this._frames.length;
            const filteredFrames = this._frames.filter(f => {
                const number = f.replace(/\D/g, "");
                if (number >= startRange && number <= endRange) {
                    return true;
                }

                return false;
            });

            let isExcpectedImageAvailable = true;
            for (let index = 0; index < filteredFrames.length; index++) {
                if (verbose) {
                    console.log(filteredFrames[index]);
                }

                isExcpectedImageAvailable = existsSync(expectedImageFullName);
                const extn = extname(filteredFrames[index]);
                const getFrameIndex = (fileName, extn) => /\d+/.exec(new RegExp(`\\d+` + extn).exec(fileName)[0])[0];
                const desiredFrame = getFrameIndex(expectedImageFullName, extn);
                const currentFrame = getFrameIndex(filteredFrames[index], extn);
                if (saveActualImageAsExpected && !isExcpectedImageAvailable && desiredFrame === currentFrame) {
                    writeFileSync(expectedImageFullName, readFileSync(filteredFrames[index]));
                    isExcpectedImageAvailable = true;
                }

                if (isExcpectedImageAvailable) {
                    const diffImage = (!shouldLogImageResults || !logStorage) ? undefined : resolve(logStorage, basename(filteredFrames[index].replace(extn, `_diff${extn}`)));
                    const result = await this.compareImages(filteredFrames[index], expectedImageFullName, diffImage, tollerance, blinkDiff.THRESHOLD_PERCENT, cropImageRect, verbose);
                    if (result) {
                        return accept(true);
                    }
                }
            }

            return accept(false);
        });
    }

    public processVideo(fullVideoName: string, frameStorageFullName = "tempFramesFolder", framesGeneralName = "frame") {
        this._frameStorageFullName = frameStorageFullName;
        this.cleanDir(this._frameStorageFullName);
        mkdirSync(this._frameStorageFullName);
        let lastFrameEnqueued = 0;
        const sorage = this._frameStorageFullName;
        const that = this;
        const imageName = resolve(this._frameStorageFullName, framesGeneralName)
        return new Promise<any>((res, reject) => {
            ffmpeg(fullVideoName)
                .on('error', function (err) {
                    console.log('An error occurred: ' + err.message);
                    reject();
                })
                .on('end', function () {
                    that._frames = new Array();
                    console.log('Processing finished !');
                    readdirSync(sorage)
                        .forEach((file) => {
                            file = resolve(sorage, file);
                            that._frames.push(file);
                        });

                    res();
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

    private async compareImages(actual: string, expected: string, output: string, valueThreshold: number = 0.01, typeThreshold, cropImageRect: IRectangle, verbose = true) {
        const diff = new blinkDiff({
            imageAPath: actual,
            cropImageA: cropImageRect,
            imageBPath: expected,
            cropImageB: cropImageRect,
            imageOutputPath: output,
            imageOutputLimit: blinkDiff.OUTPUT_ALL,
            thresholdType: typeThreshold,
            threshold: valueThreshold,
            delta: 20,
        });

        return await this.runDiff(diff, verbose);
    }

    private runDiff(diffOptions: blinkDiff, verbose) {
        return new Promise<boolean>((resolve, reject) => {
            diffOptions.run(function (error, result) {
                if (error) {
                    throw error;
                } else {
                    let message;
                    let resultCode = diffOptions.hasPassed(result.code);
                    if (resultCode) {
                        if (verbose) {
                            message = "Screen compare passed!";
                            console.log(message);
                            console.log('Found ' + result.differences + ' differences.');
                        }
                        return resolve(true);
                    } else {
                        if (verbose) {
                            message = "Screen compare failed!";
                            console.log(message);
                            console.log('Found ' + result.differences + ' differences.');
                        }
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
