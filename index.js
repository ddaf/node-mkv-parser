var ebml = {
		// From ebml module, modified decoder and schema.
		Tools: require('./lib/tools.js'),
		Schema: require('./lib/schema.js'),
		Decoder: require('./lib/decoder.js'),
	},
	fs = require('fs'),
	util = require('util');

var decoder = new ebml.Decoder();

var result = { _name: 'root' };
var currentTag = result;
var prevStack = [];

// Used while testing to avoid spam
var tagFilter = new RegExp('^disabled(cluster|cue|simpleblock).*$', 'i');

decoder.on('tag:begin', function(tagName, data) {
	
	if (!tagFilter.test(tagName)) {
		// console.log(data.level + '/' + data.level +' > '+ tagName, data.type);
		var tag = {
			_name: tagName
			//, _ebml: { enumerable: false, data: data }
		};

		if (data.type !== 'm') {
			try {
				tag = GetParsedTagData(data);
			} catch (err) {
				console.log('err while parsing %s(%s): '+ tagName, data.type, err);
			}
		}

		// Add to array if new tag can appear multiple times
		if (data.mult) {
			if (typeof currentTag[tagName] === 'undefined') currentTag[tagName] = [];
			currentTag[tagName].push(tag);
		} else {
			currentTag[tagName] = tag;
		}

		if (data.type === 'm') {
			prevStack.push(currentTag);
			currentTag = tag;
		}
	}
});
decoder.on('tag:end', function(tagName, data) {
	if (!tagFilter.test(tagName)) {
		// console.log(data.level +' > END:'+ tagName);
		if (tagName === 'Segment') {
			onSegment(currentTag, data);
		}
		if (tagName === 'TrackEntry') {
			onTrackEntry(currentTag, data);
		}
		if (tagName === 'Cluster') {
			onCluster(currentTag, data);
		}

		currentTag = prevStack.pop();
	}
});


function GetParsedTagData(tag) {
	if (tag.name === 'SeekID') return TagNameFromSeekID(tag.data.toString('hex'));
	switch (tag.type) {
		case 'u': return ReadVariableByteUIntBE(tag.data); //TODO: 4+ octets
		case 'i': return ReadVariableByteIntBE(tag.data);  //TODO: 4+ octets
		case 'f': return tag.data.readFloatBE(0);
		case 's': return tag.data.toString('ascii');
		case '8': return tag.data.toString('utf8');
		case 'd': return DateFromBuffer(tag.data, 0);
		case 'b': //return '0x'+ data.toString('hex');
		default: return tag.data;
	}
}

function TagNameFromSeekID(id) {
	return id in ebml.Schema ? ebml.Schema[id].name : id;
}

function DateFromBuffer(buf, index) {
	var hStr = buf.toString('hex', index, index+8);
	var nanoSecs = parseInt(hStr, 16);
	var milliSecs = nanoSecs / 1e6;
	return new Date(9783072e5 + milliSecs);
}

function PadToXByteAlignment(buf, x, bigEndian) {
	var padBy = x - (buf.length % x);
	var padding = new Buffer(padBy); padding.fill(0);
	return bigEndian ? Buffer.concat([padding, buf]) : Buffer.concat([buf, padding]);
}

function ReadVariableByteIntBE(buf) {
	return PadToXByteAlignment(buf, 4, true).readInt32BE(0);
}

function ReadVariableByteUIntBE(buf) {
	return PadToXByteAlignment(buf, 4, true).readUInt32BE(0);
}

function debugObj(obj, depth) {
	depth = depth || 5;
	console.log(util.inspect(obj, false, depth, true));
}

// TODO: Refactor and extract all AVC-related parsing
function GetAVCInfo(cPrivBuf) {
	console.log('AVC cbSeqHeader: '+ cPrivBuf.readUInt)
	return { 	profile:	GetAVCProfileName(cPrivBuf.readUInt8(1)),
				level:		GetAVCLevel(cPrivBuf.readUInt8(3)) };
}
function GetAVCProfileName(profile_int) {
	switch (profile_int)
	{
		case  44 : return "CAVLC 4:4:4 Intra";
		case  66 : return "Baseline";
		case  77 : return "Main";
		case  83 : return "Scalable Baseline";
		case  86 : return "Scalable High";
		case  88 : return "Extended";
		case 100 : return "High";
		case 110 : return "High 10";
		case 118 : return "Multiview High";
		case 122 : return "High 4:2:2";
		case 128 : return "Stereo High";
		case 138 : return "Multiview Depth High";
		case 144 : return "High 4:4:4";
		case 244 : return "High 4:4:4 Predictive";
		default  : return "Unknown";
	}
}
function GetAVCLevel(level_int) {
	return level_int.toString().substring(0,1) + '.'+ level_int.toString().substring(1,2);
}
function GetAACInfo(cPrivBuf) {
	// const int WAVE_FORMAT_PCM = 0x0001;
 	// const int WAVE_FORMAT_EXTENSIBLE = 0xFFFE;
	return {
		formatTag: '0x'+ cPrivBuf.slice(0, 2).toString('hex')
		//nChannels: cPrivBuf.readUInt16BE(2),
	}
}


TrackType = Object.freeze({
	VIDEO: 1,
	AUDIO: 2,
	COMPLEX: 3,
	SUBTITLE: 0x10,
	BUTTONS: 0x12,
	CONTROL: 0x20
});


// ========= MAIN ==========

require('buffer').INSPECT_MAX_BYTES = 5;
var mkvPath = "./test.webm";
// var mkvPath = './test_big-buck-bunny_trailer.webm';
// var mkvPath = "./Jellyfish-3-Mbps.mkv";

fs.readFile(mkvPath, function(err, data) {
	decoder.write(data);
});

function onSegment(segment, data) {
	//debugObj(result, 10);
	var tracks = segment.Tracks[0].TrackEntry;
	debugObj(segment.Info);
	var info = segment.Info[0];
	console.log('Duration: '+ info.Duration * info.TimecodeScale / 1e9 +' seconds');

	debugObj(tracks);
	tracks.forEach(function(track) {
		console.log('\nCodecID: '+ track.CodecID);
		console.log('CodecPrivate (len=%d): ', track.CodecPrivate ? track.CodecPrivate.length : 0, track.CodecPrivate)
		try {
			if (track.TrackType === TrackType.VIDEO) {
				debugObj( GetAVCInfo(track.CodecPrivate) )
			} else if (track.TrackType === TrackType.AUDIO) {
				debugObj( GetAACInfo(track.CodecPrivate) )
			}
		} catch (err) {
			console.log('CodecPrivErr: '+ err)
		}
	});
}

function onTrackEntry(track, data) {
	debugObj(track);
}

var receivedCluster = false;
function onCluster(cluster, data) {
	// debugObj(cluster, 1);

	if ('SimpleBlock' in cluster && !receivedCluster) {
		receivedCluster = true;
		cluster.SimpleBlock.forEach(function(sBlock) {

			// Parse SimpleBlock header
			// http://www.matroska.org/technical/specs/index.html#simpleblock_structure
			var tagLen = ebml.Tools.getTagLength(sBlock[0]);
			var trackNum = ReadVariableByteUIntBE(sBlock.slice(0, tagLen)) & 0x0F; //TODO: Will it work with 1+ tagLen?

			// TODO: Better cursor
			var timeCode = sBlock.slice(tagLen, tagLen+2).readInt16BE(0);
			console.log('SimpleBlock: ', { track: trackNum, timecode: timeCode });

			//Flags
			var cursor = tagLen + 2;

		});
	}
}
