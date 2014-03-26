var crypto = require('crypto');
var base60 = require('base60');

module.exports = {

    make: function (mf, id, prefix) {
        if (typeof id === 'number') {
            id = base60.encode();
            id = '00000000'.slice(0, 8 - id.length) + id;
        }
        return mf.joinSep(prefix || mf.options.name, id);
    },

    base60Fill: function (num, fill) {
        var fillstr = new Array(fill + 1).join('0');
        var out = base60.encode(num);
        out = fillstr.slice(0, fill - out.length) + out;
        return out;
    },

    join: function (mf) {
        var args = Array.prototype.slice.call(arguments, 1);
        var prefix, id;
        var segs = [];
        for (var aidx = 0; aidx < args.length; aidx += 2) {
            prefix = args[aidx];
            id = args[aidx + 1];
            segs.push(this.make(mf, id, prefix));
        }
        return mf.joinChild.apply(mf, segs);
    },
    
    joinSep: function (mf) {
        var args = Array.prototype.slice.call(arguments, 1);
        return args.join(mf.options.sep || '!');
    },

    joinChild: function (mf) {
        var args = Array.prototype.slice.call(arguments, 1);
        return args.join(mf.options.childsep || '~');
    },

    getLastChildPrefix: function getLastChildPrefix(mf, key) {
        var ksegs = key.split(mf.options.childsep || '~');
        var csegs = ksegs[ksegs.length - 1].split(mf.options.sep || '!');
        return csegs[0];
    },
    
    indexName: function (factory, field, value, is_int) {
        if (!is_int) {
            value = String(value).substring(0, 10).replace(/\s/g, "X");
        } else {
            value = base60.encode(value);
            value = '0000000000'.slice(0, 10 - value.length) + value;
        }
        var hash = crypto.createHash('md5').update(String(value)).digest('hex');
        var result = module.exports.joinSep(factory, '__index__', factory.options.prefix, field, value, hash);
        return result;
    }

};

