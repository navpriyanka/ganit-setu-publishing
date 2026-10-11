// Ganit Setu - FFmpeg 0.12.10 class worker.
// This worker follows the @ffmpeg/ffmpeg 0.12.x worker protocol.
// @ffmpeg/ffmpeg 0.12.10 is paired with @ffmpeg/core 0.12.6.

const CORE_VERSION = "0.12.6";

const FFMessageType = {
  LOAD:"LOAD", EXEC:"EXEC", FFPROBE:"FFPROBE", WRITE_FILE:"WRITE_FILE",
  READ_FILE:"READ_FILE", DELETE_FILE:"DELETE_FILE", RENAME:"RENAME",
  CREATE_DIR:"CREATE_DIR", LIST_DIR:"LIST_DIR", DELETE_DIR:"DELETE_DIR",
  ERROR:"ERROR", DOWNLOAD:"DOWNLOAD", PROGRESS:"PROGRESS",
  LOG:"LOG", MOUNT:"MOUNT", UNMOUNT:"UNMOUNT"
};

const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

let ffmpeg = null;

async function load(config = {}) {
  const _coreURL = config.coreURL ||
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`;
  const _wasmURL = config.wasmURL ||
    _coreURL.replace(/\.js(?:#.*)?$/i, ".wasm");
  const _workerURL = config.workerURL ||
    _coreURL.replace(/\.js(?:#.*)?$/i, ".worker.js");

  try {
    // In a module worker, import the exact core URL supplied by ffmpeg.load().
    // This is important when the page has converted the CDN files to Blob URLs
    // to avoid cross-origin/module-worker failures in Chrome.
    const mod = await import(/* @vite-ignore */ _coreURL);
    self.createFFmpegCore = mod.default || mod.createFFmpegCore;
  } catch (e) {
    throw new Error(`${ERROR_IMPORT_FAILURE.message}: ${e?.message || e}`);
  }

  if (!self.createFFmpegCore) throw ERROR_IMPORT_FAILURE;

  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: `${_coreURL}#${btoa(JSON.stringify({
      wasmURL: _wasmURL,
      workerURL: _workerURL
    }))}`
  });

  ffmpeg.setLogger(data =>
    self.postMessage({type:FFMessageType.LOG, data})
  );
  ffmpeg.setProgress(data =>
    self.postMessage({type:FFMessageType.PROGRESS, data})
  );

  return true;
}

function exec({args, timeout=-1}) {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
}

function ffprobe({args, timeout=-1}) {
  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
}

function writeFile({path,data}) {
  ffmpeg.FS.writeFile(path,data);
  return true;
}

function readFile({path,encoding}) {
  return ffmpeg.FS.readFile(path,{encoding});
}

function deleteFile({path}) { ffmpeg.FS.unlink(path); return true; }
function rename({oldPath,newPath}) { ffmpeg.FS.rename(oldPath,newPath); return true; }
function createDir({path}) { ffmpeg.FS.mkdir(path); return true; }

function listDir({path}) {
  const nodes=[];
  for(const name of ffmpeg.FS.readdir(path)){
    const stat=ffmpeg.FS.stat(`${path}/${name}`);
    nodes.push({name,isDir:ffmpeg.FS.isDir(stat.mode)});
  }
  return nodes;
}

function deleteDir({path}) { ffmpeg.FS.rmdir(path); return true; }

function mount({fsType,options,mountPoint}) {
  const fs=ffmpeg.FS.filesystems[fsType];
  if(!fs)return false;
  ffmpeg.FS.mount(fs,options,mountPoint);
  return true;
}

function unmount({mountPoint}) {
  ffmpeg.FS.unmount(mountPoint);
  return true;
}

self.onmessage = async ({data:{id,type,data:_data}}) => {
  let data;
  try {
    if(type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;

    switch(type) {
      case FFMessageType.LOAD: data = await load(_data || {}); break;
      case FFMessageType.EXEC: data = exec(_data); break;
      case FFMessageType.FFPROBE: data = ffprobe(_data); break;
      case FFMessageType.WRITE_FILE: data = writeFile(_data); break;
      case FFMessageType.READ_FILE: data = readFile(_data); break;
      case FFMessageType.DELETE_FILE: data = deleteFile(_data); break;
      case FFMessageType.RENAME: data = rename(_data); break;
      case FFMessageType.CREATE_DIR: data = createDir(_data); break;
      case FFMessageType.LIST_DIR: data = listDir(_data); break;
      case FFMessageType.DELETE_DIR: data = deleteDir(_data); break;
      case FFMessageType.MOUNT: data = mount(_data); break;
      case FFMessageType.UNMOUNT: data = unmount(_data); break;
      default: throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch(e) {
    self.postMessage({
      id,
      type:FFMessageType.ERROR,
      data:String(e && e.stack || e)
    });
    return;
  }

  const trans=[];
  if(data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({id,type,data},trans);
};
