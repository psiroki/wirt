const DOMURL = window.URL || window.webkitURL || window;
const picaApi = pica();
var exif = null;
if (!this.createImageBitmap) throw "Legacy browsers are not supported.";
let swUsed = false;
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/wirt/sw.js");
	swUsed = true;
}
try {
	exif = new Worker("exifWorker.js");
} catch(e) {
	console.warn("The exifWorker could not be loaded, JPEG files might appear in a funny orientation", e);
}

function NotAnSvgFile() { }
function InvalidSvgFile() { }
function ResultIsLarger() { }

function bindValues(input, output, formatter) {
	var prefix = output.getAttribute("data-prefix") || "";
	if(!formatter)
		formatter = value => value;
	var sync = () => {
		output.value = prefix+formatter(input.value);
	};
	input.addEventListener("input", sync);
	sync();
}

function bindValuesTight(a, b, cb) {
	var f = cb ? value => (cb(value), value) : null;
	bindValues(a, b, f);
	bindValues(b, a, f);
}

function getExif(blob) {
	return new Promise((resolve, reject) => {
		if (!exif) {
			return Promise.resolve({});
		}
		var channel = new MessageChannel();
		channel.port1.onmessage = e => resolve(e.data.exif || {});
		channel.port1.onmessageerror = e => reject(e);
		var port = channel.port2;
		exif.postMessage({ port, blob }, [port]);
	});
}

function createCanvas(width, height, canBeOffscreen = false) {
	if (canBeOffscreen && self.OffscreenCanvas) return new OffscreenCanvas(width, height);
	let canvas =  document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function gaussResize(image, width, height) {
	console.log(image.width, width);
	console.log(image.height, height);
	if (image.width > width || image.height > height) {
		let size = Math.min(image.width / width, image.height / height) * 0.5;
		let padding = Math.ceil(size * 2);
		console.log(padding);
		let extended = document.createElement("canvas");
		extended.width = image.width + padding * 2;
		extended.height = image.height + padding * 2;
		let ctx = extended.getContext("2d");
		ctx.drawImage(image, padding, padding);
		for (let y = 0; y < 3; ++y) {
			for (let x = 0; x < 3; ++x) {
				if (x != 1 || y != 1) {
					let sx = x & 2 ? image.width - 1 : 0;
					let sw = x & 1 ? image.width : 1;
					let sy = y & 2 ? image.height - 1 : 0;
					let sh = y & 1 ? image.height : 1;

					let dx = (x ? padding : 0) + (x & 2 ? image.width : 0);
					let dw = x & 1 ? image.width : padding;
					let dy = (y ? padding : 0) + (y & 2 ? image.height : 0);
					let dh = y & 1 ? image.height : padding;

					ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
				}
			}
		}

		let blurred = document.createElement("canvas");
		blurred.width = image.width;
		blurred.height = image.height;
		ctx = blurred.getContext("2d");
		ctx.filter = "blur("+size+"px)";
		ctx.drawImage(extended, -padding, -padding);
		image = blurred;
	}
	let result = document.createElement("canvas");
	result.width = width;
	result.height = height;
	let ctx = result.getContext("2d");
	ctx.drawImage(image, 0, 0, width, height);
	return Promise.resolve(result);
}

function exifFlipsOrientation(exif) {
	var o = exif && typeof exif.Orientation === "number" ? exif.Orientation : 0;
	return o > 4;
}

var config = localStorage.getItem("wirt");
if (config) {
	try {
		config = JSON.parse(config);
	} catch (_) {
		config = {};
	}
} else {
	config = {};
}

function saveConfig() {
	localStorage.setItem("wirt", JSON.stringify(config));
}

var controlList = ["yieldRange", "yieldField", "fileSelector", "bgAlphaField", "bgAlphaRange", "backgroundColor", "bgWithAlpha",
	"jpegQualityField", "jpegQualityRange", "doNotEnlargePixels", "useGaussScale", "transparentHtml"];

document.getElementsByName("outputFormat").item(0).checked = true;
document.getElementsByName("resize").item(0).checked = true;

Array.from(document.querySelectorAll("[data-cloneFor]")).forEach(e => {
	var cf = e.getAttribute("data-cloneFor").split(",").map(e => e.trim());
	var replacements = e.getAttribute("data-replace").split("/");
	var search = new RegExp(replacements.shift());
	var before = e.nextSibling;
	var p = e.parentNode;
	Array.from(e.querySelectorAll("[id]"))
		.map(f => f.id)
		.filter(f => /(?:Range|Field)$/.test(f))
		.forEach(f => controlList.push(f));
	cf.forEach((name, i) => {
		var replacement = replacements[i];
		var f = e.cloneNode(true);
		f.removeAttribute("data-cloneFor");
		f.removeAttribute("data-replace");
		var srcId = f.querySelector("[name=resize]").value;
		var visit = el => {
			if (el.nodeType === Node.TEXT_NODE) {
				el.nodeValue = el.nodeValue.replace(search, replacement);
			} else if (el.nodeType === Node.ELEMENT_NODE) {
				for (var n = el.firstChild; n; n = n.nextSibling) visit(n);
				if (el.id.substring(0, srcId.length) === srcId) {
					el.id = name + el.id.substring(srcId.length);
					controlList.push(el.id);
				}
				if (el.value === srcId) {
					el.value = name;
				}
			}
		};
		visit(f);
		p.insertBefore(f, before);
	});
});

Array.from(document.querySelectorAll("input[type=radio],input[type=color],input[type=checkbox]")).forEach(i => {
	var p = i.name || i.id;
	i.addEventListener("input", event => {
		var e = i;
		if (e.type !== "radio" || e.checked) {
			config[p] = e.type === "checkbox" ? e.checked : e.value;
			saveConfig();
		}
	});
	if (!(p in config) && (i.type !== "radio" || i.checked)) {
		config[p] = i.value;
		saveConfig();
	} else if (i.type === "radio") {
		i.checked = config[p] === i.value;
	} else if (i.type === "checkbox") {
		i.checked = config[p];
	} else if (p in config) {
		i.value = config[p];
	}
});

var controls = controlList.reduce((obj, e) => (obj[e] = document.getElementById(e), obj), {});
var rangeSuffix = "Range";
Object.keys(controls).forEach(key => {
	if (key.substring(key.length - rangeSuffix.length) === rangeSuffix) {
		var base = key.substring(0, key.length - rangeSuffix.length);
		var fieldName = base + "Field";
		if (fieldName in controls) {
			if (base in config) {
				[key, fieldName].forEach(n => controls[n].value = config[base]);
			} else {
				config[base] = +controls[fieldName].value;
			}
			bindValuesTight(controls[fieldName], controls[key], newValue => {
				if (base === "bgAlpha") {
					var cfg = new BoomSettings({alphaOverride: +newValue}).config;
					controls.bgWithAlpha.style.backgroundColor = cfg.backgroundColor;
				}
				config[base] = String(newValue);
				saveConfig();
			});
		}
	}
});

controls.backgroundColor.addEventListener("input", e => {
	var cfg = new BoomSettings().config;
	controls.bgWithAlpha.style.backgroundColor = cfg.backgroundColor;
});

function getResizeValue() {
	var rule = (Array.from(document.getElementsByName("resize")).find(e => e.checked) || {}).value;
	return {
		rule: rule,
		value: +controls[rule+"Field"].value,
		doNotEnlargePixels: (controls.doNotEnlargePixels || {}).checked || false,
		useGaussScale: (controls.useGaussScale || {}).checked || false
	};
}

function bitmapResizeSupported() {
	var c = document.createElement("canvas");
	try {
		return createImageBitmap(c, { resizeWidth: 1, resizeHeight: 1, resizeQuality: "high" })
			.then(bitmap => bitmap.width === 1).catch(_ => false);
	} catch (e) {
		return Promise.resolve(false);
	}
}

let gaussAvailable;
let resizeAvailable;

const bitmapSupportPromise = bitmapResizeSupported().then(result => {
	var classes = document.body.classList;
	resizeAvailable = result;
	gaussAvailable = "filter" in document.createElement("canvas").getContext("2d");
	console.log("Resize is available:", resizeAvailable);
	console.log("Gauss available:", gaussAvailable);
	classes.remove("bitmapSupportUnknown");
	classes.add(resizeAvailable || gaussAvailable ? "bitmapSupport" : "svgOnly");
	if (!gaussAvailable || !resizeAvailable) {
		controls.useGaussScale.disabled = true;
		controls.useGaussScale.checked = gaussAvailable;
		config.useGaussScale = gaussAvailable;
	}
});

document.body.classList.remove("loading");

function jsonClone(obj) {
	if (!obj) return obj;
	if (typeof obj !== "object") return obj;
	if (obj instanceof Array) return obj.map(e => jsonClone(e));
	return Object.keys(obj).reduce((result, key) => (result[key] = jsonClone(obj[key]), result), {});
}

function BoomSettings({alphaOverride, preparedConfig} = {}) {
	if (preparedConfig) {
		this.config = preparedConfig;
	} else {
		var alpha = (isNaN(alphaOverride) ? +controls.bgAlphaField.value : alphaOverride).toString(16);
		var checkedFormat = document.querySelector("input[name=outputFormat]:checked");
		var format = (checkedFormat || {value:png}).value;
		var formatObject = null;
		if (format !== "canvas") {
			formatObject = {
				type: "image/"+format
			};
			var cp = checkedFormat.parentNode;
			while (cp && cp.tagName.toLowerCase() !== "li") cp = cp.parentNode;
			if (cp) {
				var qualityInput = cp.querySelector("input[type=number]");
				if (qualityInput) {
					formatObject.quality = +qualityInput.value / 100;
				}
			}
		}
		this.config = {
			resize: getResizeValue(),
			backgroundColor: controls.backgroundColor.value + "00".substring(alpha.length) + alpha,
			doNotDownload: format === "canvas",
			outputFormat: formatObject,
			transparentHtml: controls.transparentHtml.checked
		};
	}
}

BoomSettings.prototype = {
	_handleCanvas(canvas) {
		if (canvas instanceof Promise) {
			return canvas.then(this._handleCanvas.bind(this));
		}
		if (this.config.doNotDownload) {
			canvas.classList.add("preview");
			canvas.addEventListener("click", _ => { canvas.remove(); });
			document.body.appendChild(canvas);
		}
		return canvas;
	},
	async processSource(text) {
		return this._handleCanvas(processSource(text, this.config));
	},
	async processHtml(html) {
		return this._handleCanvas(processHtml(html, this.config));
	},
	async processBlob(blob) {
		if (!this.config.sourceName && blob.name) {
			console.log(`Blob type: ${blob.type}`);
			var preparedConfig = jsonClone(this.config);
			preparedConfig.sourceName = blob.name;
			return new BoomSettings({preparedConfig}).processBlob(blob);
		} else if (this.config.sourceName) {
			console.log(`Blob type: ${blob.type}, source name is ${this.config.sourceName}`);
		}
		const source = await readBlobAsText(blob);
		try {
			if (blob.type === "text/html") {
				return await this.processHtml(source);
			}
			return await this.processSource(source);
		} catch (e) {
			if (e instanceof NotAnSvgFile) {
				return this._handleCanvas(pixelResize(blob, this.config));
			}
			throw e;
		}
	}
};

function resize(dims, config) {
	var rule = config.rule;
	var value = config.value;
	console.log("Rule is "+rule);
	var scale = 1;
	if (rule in dims) {
		scale = value / dims[rule];
	} else if (rule === "maxDim") {
		scale = value / Math.max(dims.width, dims.height);
	} else if (rule === "minDim") {
		scale = value / Math.min(dims.width, dims.height);
	} else {
		scale = value;
	}
	if (scale > 1) {
		if (config.failIfLarger) {
			throw new ResultIsLarger();
		}
		if (config.doNotEnlargePixels) {
			scale = 1;
		}
	}
	for (var key in dims) {
		dims[key] *= scale;
	}
	return dims;
}

function removeScripts(node) {
	if (!(node instanceof Element)) return;
	if (node.tagName.toLowerCase() === "script") {
		node.remove();
		return;
	}
	for (let e of node.getAttributeNames().filter(e => e.toLowerCase().startsWith("on"))) {
		node.removeAttribute(e);
	}
	for (let c of Array.from(node.children)) {
		removeScripts(c);
	}
}

function processHtml(html, config) {
	// measure
	let frame = document.createElement("iframe");
	frame.style.border = "none";
	frame.style.width = "1280px";
	frame.style.height = "1280px";
	let container = document.createElement("div");
	container.style.width = container.style.height = "0";
	container.style.overflow = "hidden";
	container.style.opacity = 0;
	container.style.pointerEvents = "none";
	container.append(frame);
	document.body.append(container);
	const parser = new DOMParser();
	let htmlDoc = parser.parseFromString(html, "text/html");
	removeScripts(htmlDoc.documentElement);
	let style = htmlDoc.createElement("style");
	style.textContent =
		"pre,html,body{margin:0;padding:0}"+
		"html{overflow:auto}body{overflow:hidden}";
	const htmlBody = htmlDoc.body;
	frame.contentDocument.head.append(style.cloneNode(true));
	const measure = frame.contentDocument.body;
	measure.style.display = "inline-block";
	measure.innerHTML = htmlBody.innerHTML;
	const r = measure.getBoundingClientRect();
	const w = Math.ceil(r.width);
	const h = Math.ceil(r.height);
	container.remove();

	// generate svg
	let svgDoc = parser.parseFromString(
		"<svg xmlns=\"http://www.w3.org/2000/svg\"><foreignObject width=\"100%\" " +
		"height=\"100%\"><div xmlns=\"http://www.w3.org/1999/xhtml\"></div></fore" +
		"ignObject></svg>", "image/svg+xml");
	let svg = svgDoc.documentElement;
	svg.setAttribute("width", w);
	svg.setAttribute("height", h);
	svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	svg.querySelector("foreignObject").append(style);
	let svgDiv = svg.querySelector("div");
	while (htmlBody.firstChild) {
		let node = htmlBody.firstChild;
		if (config.transparentHtml && node instanceof Element) {
			let s = node.style;
			for (let bg of Array.from(s)
					.filter(e => e.toLowerCase().startsWith("background"))) {
				s.removeProperty(bg);
			}
		}
		svgDiv.append(node);
	}
	const svgSource = new XMLSerializer().serializeToString(svg);
	container.append(svg);
	return processSource(svgSource, config);
}

function processSource(text, config) {
	var logger = config.logger || console;
	var parser = new DOMParser();
	var serializer = new XMLSerializer();
	var doc = parser.parseFromString(text, "application/xml");
	var root = doc.documentElement;
	if (!root.getAttribute("viewBox")) {
		var w = root.getAttribute("width");
		var h = root.getAttribute("height");
		if (w && h) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
	}
	var rootIsSvg = root.tagName === "svg";
	if (!rootIsSvg || !root.getAttribute("viewBox")) {
		logger.error("Not an svg, or does not have a viewBox attribute:");
		logger.error(serializer.serializeToString(doc));
		if (!rootIsSvg)
			return Promise.reject(new NotAnSvgFile());
		return Promise.reject(new InvalidSvgFile());
	}
	var box = root.getAttribute("viewBox").trim().split(/\s+/);
	var width = +(parseFloat(root.getAttribute("width")) || box[2]);
	var height = +(parseFloat(root.getAttribute("height")) || box[3]);
	var resizeRule = config.resize;
	if (resizeRule.doNotEnlargePixels) {
		resizeRule = jsonClone(resizeRule);
		resizeRule.doNotEnlargePixels = false;
	}
	var d = resize({ width, height }, resizeRule);
	var newWidth = d.width.toFixed(2);
	var newHeight = d.height.toFixed(2);
	logger.log(`Resizing from ${width}x${height} to ${newWidth}x${newHeight}`);
	root.setAttribute("width", newWidth);
	root.setAttribute("height", newHeight);
	return svgToFile(config.sourceName, serializer.serializeToString(doc), config.backgroundColor, config.doNotDownload ? null : config.outputFormat);
}

function pixelResize(blob, config) {
	var exifPromise = getExif(blob);
	return createImageBitmap(blob).then(baseBitmap => exifPromise.then(exif => {
		var flip = exifFlipsOrientation(exif);
		var width = flip ? baseBitmap.height : baseBitmap.width;
		var height = flip ? baseBitmap.width: baseBitmap.height;
		var d = resize({ width, height }, config.resize);
		var newWidth = Math.round(flip ? d.height : d.width);
		var newHeight = Math.round(flip ? d.width : d.height);
		let resizePromise;
		if (config.resize.useGaussScale) {
			resizePromise = gaussResize(baseBitmap, newWidth, newHeight);
		} else {
			resizePromise = picaApi.resize(baseBitmap, createCanvas(newWidth, newHeight, true))
					.then(canvas => createImageBitmap(canvas));
		}
		return resizePromise.then(resizedBitmap => {
				var canvas = imageToCanvas(resizedBitmap, config.backgroundColor, exif);
				if (config.doNotDownload) return canvas;
				var baseName = "image";
				if (config.sourceName) {
					baseName = config.sourceName;
					var dot = baseName.lastIndexOf(".");
					if (dot >= 0) baseName = baseName.substring(0, dot);
				}
				nameAndDownloadCanvas(baseName+"_.", canvas, config.outputFormat);
				return null;
			});
	}));
}

dropHandler(document.body, blob => new BoomSettings().processBlob(blob), () => {});
controls.fileSelector.addEventListener("input", function(e) {
	let files = Array.from(e.target.files);
	e.target.value = "";
	for (let file of files) {
		new BoomSettings().processBlob(file);	
	}
});


const pasteTargets = new Set(["text", "number"]);

function transferItemString(item) {
	return item && new Promise((resolve, reject) => {
		try {
			item.getAsString(s => resolve(s));
		} catch (e) {
			reject(e);
		}
	});
}

document.body.addEventListener("paste", function(e) {
	if ((e.target.tagName || "").toLowerCase() === "input" && pasteTargets.has(e.target.type.toLowerCase())) return;
	const items = (e.clipboardData || {}).items;
	if (items) {
		let stringItem;
		let htmlItem;
		for (let item of items) {
			if (item.kind === "file") {
				// file support is broken
				console.log("File found: "+item.type, item);
				const m = /^image\/(svg)?/i.exec(item.type);
				if (m && !m[1]) {
					const f = item.getAsFile();
					if (f) {
						new BoomSettings().processBlob(f);
						stringItem = null;
						htmlItem = null;
						break;
					} else {
						console.log("No file object though");
					}
				}
			} else if (item.kind === "string") {
				if (item.type === "text/plain") {
					stringItem = item;
				} else if (item.type === "text/html") {
					htmlItem = item;
				}
			}
		}
		const htmlPromise = transferItemString(htmlItem);
		const stringPromise = transferItemString(stringItem);
		if (stringPromise) {
			const settings = new BoomSettings();
			stringPromise.then(plain => settings.processSource(plain).catch(e => {
				if (e instanceof NotAnSvgFile) {
					if (htmlPromise) {
						return htmlPromise.then(html => settings.processHtml(html));
					} else {
						// try to process the raw text as HTML
						return settings.processHtml(plain);
					}
				}
			}));
		} else if (htmlPromise) {
			const settings = new BoomSettings();
			htmlPromise.then(s => settings.processHtml(s));
		}
	}
});

function readBlobAsText(blob) {
	if (!blob) throw "Blob must not be null(ish)";
	return new Promise((resolve, reject) => {
		var reader = new FileReader();
		reader.onload = function() {
			resolve(reader.result);
		};
		reader.onerror = function() {
			reject("error loading file");
		};
		reader.readAsText(blob, "UTF-8");
	});
}

function readBlobAsBytes(blob) {
	if (!blob) throw "Blob must not be null(ish)";
	return new Promise((resolve, reject) => {
		var reader = new FileReader();
		reader.onload = function() {
			if (reader.result instanceof ArrayBuffer) {
				resolve(new Uint8Array(reader.result));
			} else {
				resolve(reader.result);
			}
		};
		reader.onerror = function() {
			reject("error loading file");
		};
		reader.readAsArrayBuffer(blob, "UTF-8");
	});
}

function imageToCanvas(image, bgColor, exif) {
	var canvas = document.createElement("canvas");
	var o = exif && typeof exif.Orientation === "number" ? exif.Orientation : 0;
	var w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
	var h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
	if (exifFlipsOrientation(exif)) {
		var s = w;
		w = h;
		h = s;
	}
	canvas.width = w;
	canvas.height = h;
	var ctx = canvas.getContext("2d");
	ctx.save();
	if(o >= 1) {
		var mat = new Float32Array(6);
		var x = o <= 4 ? 0 : 1;
		var y = o <= 4 ? 1 : 0;
		var xs = (o&3)>>1 ? -1 : 1;
		var ys = ((o-1)&3)>>1 ? -1 : 1;
		mat[2*x] = xs;
		mat[2*y] = 0;
		mat[2*x+1] = 0;
		mat[2*y+1] = ys;
		mat[4] = -w*Math.min(0, xs);
		mat[5] = -h*Math.min(0, ys);
		ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
	}
	if (bgColor) {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(image, 0, 0);
	ctx.restore();
	return canvas;
}

const blobsAreTainted = true;

function svgToCanvas(svgString, bgColor) {
	return new Promise((resolve, reject) => {
		var image = new Image();
		var url;
		if (blobsAreTainted) {
			url = "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svgString);
		} else {
			var blob = new Blob([svgString], { type: "image/svg+xml" });
			url = URL.createObjectURL(blob);
		}
		image.onload = event => {
			setTimeout(() => URL.revokeObjectURL(url), 0);
			try {
				resolve(imageToCanvas(image, bgColor));
			} catch (e) {
				reject(e);
			}
		};
		image.onerror = event => {
			setTimeout(() => URL.revokeObjectURL(url), 0);
			console.error(event);
			reject(event);
		};
		image.src = url;
	});
}

function nameAndDownloadCanvas(baseName, canvas, format) {
	var ext = format.type;
	var slash = ext.lastIndexOf("/");
	ext = ext.substring(slash + 1);
	downloadCanvas(baseName+ext, canvas, format.type, format.quality || null, { addCrc32ToName: true });
}

function svgToFile(sourceName, svgString, bgColor, format) {
	if (typeof format === "undefined")
		format = null;
	let promise = svgToCanvas(svgString, bgColor);
	if (format) {
		return promise.then(canvas => {
			if (!sourceName) {
				sourceName = "svg";
			} else {
				var lastDot = sourceName.lastIndexOf(".");
				if (lastDot >= 0) {
					sourceName = sourceName.substring(0, lastDot);
				}
			}
			nameAndDownloadCanvas(sourceName+"_.", canvas, format);
			return null;
		});
	}
	return promise;
}

function canvasToBlob(canvas, contentType, encoderOptions) {
	return new Promise(resolve => {
		canvas.toBlob(resolve, contentType, encoderOptions);
	});
}

function formatCrc(crc) {
	if (crc < 0) {
		crc = (crc >>> 4).toString(16)+(crc & 0xf).toString(16);
	} else {
		crc = crc.toString(16);
	}
	return "00000000".substring(crc.length)+crc;
}

async function downloadCanvas(downloadName, canvas, contentType, encoderOptions, downloadOptions) {
	var blob = await canvasToBlob(canvas, contentType, encoderOptions);
	downloadOptions = downloadOptions || {};
	if (downloadOptions.addCrc32ToName) {
		var crc = formatCrc(crc32(await readBlobAsBytes(blob)));
		downloadName = downloadName.replace(/\.([^\.]+)$/, crc+".$1");
	}
	var blobUrl = DOMURL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = blobUrl;
	a.download = downloadName;
	a.click();
	DOMURL.revokeObjectURL(blobUrl);
}

if (swUsed) {
	navigator.serviceWorker.addEventListener("message", event => {
		const msg = event.data;
		if ("version" in msg) {
			const ver = document.querySelector("#ver");
			ver.textContent = msg["version"];
		}
	});
	navigator.serviceWorker.ready.then(reg => reg.active.postMessage({"action": "hi"}));
}
