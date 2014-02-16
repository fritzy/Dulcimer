var VeryLevelModel = require('../index.js');
var level = require('level');
var db = level(__dirname + '/testdb', {valueEncoding: 'json', errorIfExists: true});
var async = require('async');

module.exports = {
    'Create multiple children': function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'TM'});
        var TMC = new VeryLevelModel({cidx: {}}, {db: db, prefix: 'RC'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var cidx = 0;
            async.whilst(function () {
                cidx++;
                return cidx <= 10;
            },
            function (acb) {
                var tmc = tm.createChild(TMC, {cidx: cidx});
                tmc.save(function (err, tmc) {
                    acb(err);
                });
            },
            function (err) {
                tm.getChildren(TMC, function (err, children) {
                    test.equal(children.length, 10, "Not all children found (" + children.length + ")");
                    test.done();
                });
            });
        });
    },
    'Custom keyname': function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'TM'});
        var tm = TM.create({idx: 'crap', keyname: 'custom'});
        test.equal(tm.key, 'TM!custom');
        test.done();

    },
    'Keyname is uuid': function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'TM'});
        var tm = TM.create({idx: 'crap'});
        test.notEqual(tm.key, 'TM!undefined');
        test.done();
    },
    'Delete old index': function (test) {
        var TM = new VeryLevelModel({idx: {index: true}, name: {}}, {db: db, prefix: 'DOI'});
        var tm = TM.create({'idx':  'ham', 'name': 'swiss'});
        tm.save(function (err) {
            test.ifError(err);
            TM.getByIndex('idx', 'ham', function (err, tms) {
                test.equals(tms.length, 1, 'Should have had one');
                tm.idx = 'salami';
                tm.save(function (err) {
                    test.ifError(err);
                    TM.getByIndex('idx', 'ham', function (err, tms) {
                        test.equals(tms.length, 0);
                        TM.getByIndex('idx', 'salami', function (err, tms) {
                            test.equals(tms.length, 1);
                            test.done();
                        });
                    });
                });
            });
        });
    }
};

