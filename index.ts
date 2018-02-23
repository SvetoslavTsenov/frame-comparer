import { FrameComparer } from "./lib/frame-comparer";
import { resolve } from "path";

export { FrameComparer } from "./lib/frame-comparer";


export function createFrameComparer(){
    return new FrameComparer();
}

// const storage = resolve("./");
// const tempFolder = `${storage}/temp`;
// const fullVideoName = "https://media.w3.org/2010/05/sintel/trailer.mp4";
//const videoComparer: VideoComparer = new VideoComparer(fullVideoName);

// async function test() {
//     await videoComparer.processVideo(tempFolder);
//     let result = await videoComparer.compareImageFromVideo(resolve(storage, "test55.png"), 50, 60);
//     return result;
// }

// test();