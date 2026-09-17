// =====================================================================
// VEXA — Vendored QR encoder (byte-mode, versions 1-40, real Reed-Solomon
// ECC + mask scoring). Based on the public-domain algorithm by Project
// Nayuki (structure re-implemented compactly). Injected into the app
// shell as an inline <script> — see pages/app-shell.js.
// =====================================================================

export const QR_LIB = `
// Minimal but CORRECT QR Code generator, byte-mode only, versions 1-40, all ECC levels.
// Based on the public-domain algorithm by Project Nayuki (structure re-implemented compactly).
var qrcodegen = {};
(function (qr) {
  "use strict";

  // ---- Tables -----------------------------------------------------------
  var ECC_CODEWORDS_PER_BLOCK = [
    // Index: [ecl][version] , ecl order = L, M, Q, H  (ordinal 0..3)
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  ];

  function eccOrdinal(ecl) { return ecl.ordinal; }

  function getNumRawDataModules(ver) {
    if (ver < 1 || ver > 40) throw new RangeError("version out of range");
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[eccOrdinal(ecl)][ver]
      * NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal(ecl)][ver];
  }

  // ---- Bit buffer helpers -------------------------------------------------
  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  // ---- Segment (byte mode only) -------------------------------------------
  var QrSegment = {};
  QrSegment.makeBytes = function (bytes) {
    var bb = [];
    bytes.forEach(function (b) { appendBits(b, 8, bb); });
    return { mode: { modeBits: 0x4, numCharCountBits: function (ver) {
        return ver < 10 ? 8 : (ver < 27 ? 16 : 16);
      } }, numChars: bytes.length, bitData: bb };
  };
  qr.QrSegment = QrSegment;

  function getTotalBits(segs, version) {
    var result = 0;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= (1 << ccbits)) return Infinity;
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }

  // ---- Reed-Solomon ECC ----------------------------------------------------
  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function reedSolomonComputeDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) {
        result[i] ^= reedSolomonMultiply(coef, factor);
      });
    });
    return result;
  }

  // ---- QR Code core ----------------------------------------------------------
  function QrCode(version, ecl, dataCodewords, mask) {
    this.version = version;
    this.errorCorrectionLevel = ecl;
    this.size = version * 4 + 17;
    var size = this.size;
    this.modules = [];
    this.isFunction = [];
    for (var i = 0; i < size; i++) {
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }

    drawFunctionPatterns(this);
    var allCodewords = addEccAndInterleave(this, dataCodewords);
    drawCodewords(this, allCodewords);

    if (mask === -1) {
      var minPenalty = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(this, m);
        drawFormatBits(this, m);
        var penalty = getPenaltyScore(this);
        if (penalty < minPenalty) { minPenalty = penalty; mask = m; }
        applyMask(this, m); // undo
      }
    }
    applyMask(this, mask);
    drawFormatBits(this, mask);
    this.mask = mask;

    this.toSvgString = function (border) { return toSvg(this, border); };
  }
  qr.QrCode = QrCode;

  QrCode.Ecc = {
    LOW: { ordinal: 0, formatBits: 1 },
    MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH: { ordinal: 3, formatBits: 2 }
  };

  QrCode.encodeText = function (text, ecl) {
    var utf8 = unescape(encodeURIComponent(text));
    var bytes = [];
    for (var i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
    var seg = QrSegment.makeBytes(bytes);
    return QrCode.encodeSegments([seg], ecl);
  };

  QrCode.encodeSegments = function (segs, ecl) {
    var version;
    var dataUsedBits;
    for (version = 1; version <= 40; version++) {
      var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
      var usedBits = getTotalBits(segs, version);
      if (usedBits <= dataCapacityBits) { dataUsedBits = usedBits; break; }
      if (version === 40) throw new Error("Data too long for QR Code");
    }

    var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    var bb = [];
    segs.forEach(function (seg) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      seg.bitData.forEach(function (b) { bb.push(b); });
    });

    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - bb.length % 8) % 8, bb);

    for (var padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    var dataCodewords = [];
    for (var i = 0; i < bb.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bb[i + j];
      dataCodewords.push(b);
    }

    return new QrCode(version, ecl, dataCodewords, -1);
  };

  function addEccAndInterleave(qrcode, data) {
    var ver = qrcode.version, ecl = qrcode.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal(ecl)][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccOrdinal(ecl)][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + datLen);
      k += datLen;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var i2 = 0; i2 < blocks[0].length; i2++) {
      blocks.forEach(function (block, j) {
        if (i2 !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(block[i2]);
        }
      });
    }
    return result;
  }

  // ---- Drawing ---------------------------------------------------------------
  function setFunctionModule(q, x, y, isDark) {
    q.modules[y][x] = isDark;
    q.isFunction[y][x] = true;
  }

  function drawFunctionPatterns(q) {
    var size = q.size;
    for (var i = 0; i < size; i++) {
      setFunctionModule(q, 6, i, i % 2 === 0);
      setFunctionModule(q, i, 6, i % 2 === 0);
    }
    drawFinderPattern(q, 3, 3);
    drawFinderPattern(q, size - 4, 3);
    drawFinderPattern(q, 3, size - 4);

    var alignPatPos = getAlignmentPatternPositions(q.version);
    var numAlign = alignPatPos.length;
    for (var i2 = 0; i2 < numAlign; i2++) {
      for (var j2 = 0; j2 < numAlign; j2++) {
        if (!((i2 === 0 && j2 === 0) || (i2 === 0 && j2 === numAlign - 1) || (i2 === numAlign - 1 && j2 === 0))) {
          drawAlignmentPattern(q, alignPatPos[i2], alignPatPos[j2]);
        }
      }
    }
    drawFormatBits(q, 0); // placeholder, fixed later
    drawVersion(q);
  }

  function drawFormatBits(q, mask) {
    var data = (q.errorCorrectionLevel.formatBits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    for (var i2 = 0; i2 <= 5; i2++) setFunctionModule(q, 8, i2, getBit(bits, i2));
    setFunctionModule(q, 8, 7, getBit(bits, 6));
    setFunctionModule(q, 8, 8, getBit(bits, 7));
    setFunctionModule(q, 7, 8, getBit(bits, 8));
    for (var i3 = 9; i3 < 15; i3++) setFunctionModule(q, 14 - i3, 8, getBit(bits, i3));

    var size = q.size;
    for (var i4 = 0; i4 < 8; i4++) setFunctionModule(q, size - 1 - i4, 8, getBit(bits, i4));
    for (var i5 = 8; i5 < 15; i5++) setFunctionModule(q, 8, size - 15 + i5, getBit(bits, i5));
    setFunctionModule(q, 8, size - 8, true);
  }

  function drawVersion(q) {
    if (q.version < 7) return;
    var rem = q.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (q.version << 12) | rem;
    var size = q.size;
    for (var i2 = 0; i2 < 18; i2++) {
      var color = getBit(bits, i2);
      var a = size - 11 + i2 % 3;
      var b = Math.floor(i2 / 3);
      setFunctionModule(q, a, b, color);
      setFunctionModule(q, b, a, color);
    }
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function drawFinderPattern(q, x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < q.size && yy >= 0 && yy < q.size) {
          setFunctionModule(q, xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  function drawAlignmentPattern(q, x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        setFunctionModule(q, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function getAlignmentPatternPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step;
    if (ver === 32) step = 26;
    else step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    var size = ver * 4 + 17;
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function drawCodewords(q, data) {
    var size = q.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!q.isFunction[y][x] && i < data.length * 8) {
            var bit = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            q.modules[y][x] = bit;
            i++;
          }
        }
      }
    }
  }

  function applyMask(q, mask) {
    var size = q.size;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (q.isFunction[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: throw new Error("bad mask");
        }
        if (invert) q.modules[y][x] = !q.modules[y][x];
      }
    }
  }

  function getPenaltyScore(q) {
    var size = q.size;
    var result = 0;
    // Adjacent modules in row/col with same color
    for (var y = 0; y < size; y++) {
      var runColor = false, runX = 0;
      var runHistory = [0,0,0,0,0,0,0];
      for (var x = 0; x < size; x++) {
        if (q.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result++;
        } else {
          runColor = q.modules[y][x]; runX = 1;
        }
      }
    }
    for (var x2 = 0; x2 < size; x2++) {
      var runColor2 = false, runY = 0;
      for (var y2 = 0; y2 < size; y2++) {
        if (q.modules[y2][x2] === runColor2) {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result++;
        } else {
          runColor2 = q.modules[y2][x2]; runY = 1;
        }
      }
    }
    // 2x2 blocks
    for (var y3 = 0; y3 < size - 1; y3++) {
      for (var x3 = 0; x3 < size - 1; x3++) {
        var c = q.modules[y3][x3];
        if (c === q.modules[y3][x3+1] && c === q.modules[y3+1][x3] && c === q.modules[y3+1][x3+1]) {
          result += 3;
        }
      }
    }
    // Finder-like patterns
    for (var y4 = 0; y4 < size; y4++) {
      for (var x4 = 0; x4 < size - 6; x4++) {
        if (hasFinderLike(q, x4, y4, true)) result += 40;
      }
    }
    for (var x5 = 0; x5 < size; x5++) {
      for (var y5 = 0; y5 < size - 6; y5++) {
        if (hasFinderLike(q, x5, y5, false)) result += 40;
      }
    }
    // Balance of dark modules
    var dark = 0;
    for (var y6 = 0; y6 < size; y6++) for (var x6 = 0; x6 < size; x6++) if (q.modules[y6][x6]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(k, 0) * 10;
    return result;
  }

  function hasFinderLike(q, x, y, horizontal) {
    var pattern = [true,false,true,true,true,false,true];
    for (var i = 0; i < 7; i++) {
      var mx = horizontal ? x + i : x;
      var my = horizontal ? y : y + i;
      if (q.modules[my][mx] !== pattern[i]) return false;
    }
    return true;
  }

  function toSvg(q, border) {
    var parts = [];
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.modules[y][x]) parts.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
      }
    }
    var dim = q.size + border * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim +
      '" stroke="none"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="' +
      parts.join(" ") + '" fill="#000000"/></svg>';
  }

})(qrcodegen);
`;
