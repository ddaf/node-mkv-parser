var ebml = {
		// From ebml module, modified decoder and schema.
		Tools: require('./lib/tools.js'),
    	Schema: require('./lib/schema.js'),
    	Decoder: require('./lib/decoder.js'),
    },
	fs = require('fs'),
	util = require('util');

var mkvPath = "./True.Detective.S01E01.480p.x264-mSD.mkv";
// var mkvPath = "./Jellyfish-3-Mbps.mkv";

var decoder = new ebml.Decoder();

var result = { };
var currentTag = result;
var previousTag;
var previousMap = {};

// Used while testing to avoid spam
var tagFilter = new RegExp('^(cluster|cue|simpleblock).*$', 'i');

decoder.on('tag:begin', function(tagName, depth, data) {
	
	if (!tagFilter.test(tagName)) {
		
		// console.log(depth + '/' + data.level +' > '+ tagName, data.type);

		var tag = {};

		// Add to array if new tag can appear multiple times
		if (data.mult) {
			if (typeof currentTag[tagName] === 'undefined') currentTag[tagName] = [];
			currentTag[tagName].push(tag);
		} else if (data.type !== 'm') {
			try {
				currentTag[tagName] = getParsedTagData(data.type, data.data);
			} catch (err) {
				console.log('err while parsing %s(%s): '+ tagName, data.type, err);
			}
		} else {
			currentTag[tagName] = tag;
		}

		if (data.type === 'm') {
			// console.log('Setting current %s >> %s', currentTag._name, tagName)
			previousMap[depth] = currentTag;
			previousTag = currentTag;
			currentTag = tag;
		} else {
			
		}
	}
});
decoder.on('tag:end', function(tagName, depth, data) {
	if (!tagFilter.test(tagName)) {
		// console.log(data.level +' > END:'+ tagName, data.type);

		var prev2Tag = previousMap[depth-2];
		// console.log('Setting current %s << %s', previousTag._name, currentTag._name)
		currentTag = previousTag;
		if (prev2Tag) {
			previousTag = prev2Tag;
		}
	}
});


function getParsedTagData(type, data) {
	switch (type) {
		case 'u':
			return readVariableByteUIntBE(data);
		case 'i':
			return readVariableByteIntBE(data);
		case 'f':
			return data.readFloatBE(0);
		case 'b':
			return data;
			//return '0x'+ data.toString('hex'); //binary
		case 's':
			return data.toString('ascii');
		case '8':
			return data.toString('utf8');
		case 'd':
			// 2012: <Buffer 05 18 45 3f 1c d9 fe 00>
			// 2014: <Buffer 05 b5 38 0d 97 65 58 00>
			return DateFromBuffer(data, 0);
		default:
			return null;
	}
}

function DateFromBuffer(buff, index) {
    var hStr = buff.toString('hex', index, index+8);
    var nanoSecs = parseInt(hStr, 16);
    var milliSecs = nanoSecs / 1e6;
    return new Date(9783072e5 + milliSecs);
}

function padToXByteAlignment(buf, x, be) {
	var padBy = x - (buf.length % x);
	var padding = new Buffer(padBy); padding.fill(0);
	return be ? Buffer.concat([padding, buf]) : Buffer.concat([buf, padding]);
}

function readVariableByteIntBE(buf) {
	return padToXByteAlignment(buf, 4, true).readInt32BE(0);
}

function readVariableByteUIntBE(buf) {
	return padToXByteAlignment(buf, 4, true).readUInt32BE(0);
}

function debugObj(obj, depth) {
	depth = depth || 5;
	console.log(util.inspect(obj, false, depth, true));
}

TrackType = Object.freeze({
	VIDEO: 1,
	AUDIO: 2
});

fs.readFile(mkvPath, function(err, data) {
	decoder.write(data);
});

setTimeout(function() {
	require('buffer').INSPECT_MAX_BYTES = 10;

	var info = result.Segment[0].Info[0];
	var videoTrack = result.Segment[0].Tracks[0].TrackEntry;
	debugObj(result, 10);
	//debugObj(info);
	//debugObj(videoTrack);
	console.log('Duration: '+ info.Duration * info.TimecodeScale / 1e9 +' seconds');

}, 1000);