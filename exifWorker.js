var amd = true;
var EXIF = null;
function define(name, _, factory) {
	EXIF = factory();
}

importScripts("exif.js");

onmessage = function(e) {
	var port = e.data.port;
	var blob = e.data.blob;
	var fr = new FileReader();
	fr.onload = function(_) {
		var exif = EXIF.readFromBinaryFile(fr.result);
		port.postMessage({ exif });
    };
    fr.onerror = function(_) {
        port.postMessage({ exif });
    };
	fr.readAsArrayBuffer(blob.slice(0, 1048576));
};
