import * as ffmpeg from 'fluent-ffmpeg';
import * as blinkDiff from "blink-diff";
import { resolve, basename, extname } from 'path';
import { statSync, existsSync, readdirSync, unlinkSync, rmdirSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { IRectangle } from './interfaces/rectangle';

export class FrameComparer {
    public static async compareImageFromVideo(frames: Array<string>, expectedImageFullName: string, logStorage: string, startRange, endRange, tollerance: number = 0.2, saveActualImageAsExpected: boolean = true, shouldLogImageResults: boolean = false, cropImageRect: IRectangle = undefined, verbose = true): Promise<boolean> {
        if (!saveActualImageAsExpected && !existsSync(expectedImageFullName)) {
            throw new Error(`${expectedImageFullName} is not available!!!`);
        }
        return new Promise<boolean>(async (accept, reject) => {
            endRange = endRange < frames.length ? endRange : frames.length;
            const filteredFrames = frames.filter(f => {
                const number = FrameComparer.convertFrameNameToNumber(f);
                return number >= startRange && number <= endRange;
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
                    const result = (await FrameComparer.compareImages(filteredFrames[index], expectedImageFullName, diffImage, tollerance, blinkDiff.THRESHOLD_PERCENT, cropImageRect, verbose)).result;
                    if (result) {
                        return accept(true);
                    }
                }
            }

            return accept(false);
        });
    }

    public static getEqualImages(frames, expectedImageFullName: string, startRange: number, endRange: number, tollerance: number = 0.00, cropImageRect: IRectangle = undefined, verbose = true): Promise<Map<number, string>> {
        if (!existsSync(expectedImageFullName)) {
            throw new Error(`${expectedImageFullName} is not available!!!`);
        }
        return new Promise<Map<number, string>>(async (accept, reject) => {
            endRange = endRange < frames.length ? endRange : frames.length -1;
            const filteredFrames = frames.filter(f => {
                const number = FrameComparer.convertFrameNameToNumber(f);
                if (number >= startRange && number <= endRange) {
                    return true;
                }

                return false;
            }).sort((a, b) => {
                const numberA = FrameComparer.convertFrameNameToNumber(a);
                const numberB = FrameComparer.convertFrameNameToNumber(b);

                return numberA > numberB ? 1 : -1;
            });

            const equalFrames = new Map<number, string>();
            let previosResult = undefined;
            for (let index = 0; index < filteredFrames.length; index++) {
                if (verbose) {
                    console.log(filteredFrames[index]);
                }

                const ext = extname(filteredFrames[index]);
                const diffImageName = verbose ? filteredFrames[index].replace(ext, `_diff${ext}`) : undefined;
                const result = await FrameComparer.compareImages(filteredFrames[index], expectedImageFullName, diffImageName, tollerance, blinkDiff.THRESHOLD_PIXEL, cropImageRect, verbose);
                
                // if(!result.result && result.differences - previosResult > 40000 ){
                //     index = filteredFrames.length;
                // }
                previosResult = result.differences;
                if (result.result) {
                    const number = FrameComparer.convertFrameNameToNumber(filteredFrames[index]);
                    equalFrames.set(number, filteredFrames[index]);
                }
            }

            return accept(equalFrames);
        });
    }

    public static processVideo(fullVideoName: string, frameStorageFullName = "tempFramesFolder", framesGeneralName = "frame") {
        FrameComparer.cleanDir(frameStorageFullName);
        if (!existsSync(frameStorageFullName)) {
            mkdirSync(frameStorageFullName);
        }
        let lastFrameEnqueued = 0;
        const frames = new Array();;
        const imageName = resolve(frameStorageFullName, framesGeneralName)
        return new Promise<any>((res, reject) => {
            ffmpeg(fullVideoName)
                .on('error', function (err) {
                    console.log('An error occurred: ' + err.message);
                    reject();
                })
                .on('end', function () {
                    console.log('Processing finished !');
                    readdirSync(frameStorageFullName)
                        .forEach((file) => {
                            file = resolve(frameStorageFullName, file);
                            frames.push(file);
                        });

                    return res(frames);
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

    public static async getMetaData(videoFullName: string) {
        return new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(videoFullName, function (err, metadata) {
                //console.dir(metadata); // all metadata
                console.log("Meta data info: ", metadata);
                if (err) {
                    console.error(err);
                }
                resolve(metadata);
            });
        });
    }

    private static convertFrameNameToNumber = frame => {
        return parseInt(/\d+/gm.exec(/\d+.png/gm.exec(frame)[0])[0]);
    }

    private static async compareImages(actual: string, expected: string, output: string, valueThreshold: number = 0.01, typeThreshold, cropImageRect: IRectangle, verbose = true) {
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

        return await FrameComparer.runDiff(diff, verbose);
    }

    private static runDiff(diffOptions: blinkDiff, verbose) {
        return new Promise<{ differences: number, result: boolean }>((resolve, reject) => {
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
                        return resolve({ differences: result.differences, result: true });
                    } else {
                        if (verbose) {
                            message = "Screen compare failed!";
                            console.log(message);
                            console.log('Found ' + result.differences + ' differences.');
                        }
                        return resolve({ differences: result.differences, result: false });
                    }
                }
            });
        });
    }

    private static cleanDir(dirFullName) {
        if (existsSync(dirFullName)) {
            const pathToFile = dirFullName;
            readdirSync(dirFullName)
                .forEach(file => {
                    const f = resolve(pathToFile, file);
                    if (FrameComparer.isDirectory(f)) {
                        FrameComparer.cleanDir(f);
                    }
                    unlinkSync(f);
                });

            //
            rmdirSync(dirFullName);
        }
    }

    private static isDirectory(fullName) {
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

