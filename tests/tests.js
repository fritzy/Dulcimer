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
                test.ifError(err);
                test.equals(tms.length, 1, 'Should have had one');
                tm.idx = 'salami';
                tm.save(function (err) {
                    test.ifError(err);
                    TM.getByIndex('idx', 'ham', function (err, tms) {
                        test.ok(err);
                        test.ok(!tms);
                        TM.getByIndex('idx', 'salami', function (err, tms) {
                            test.equals(tms.length, 1);
                            test.done();
                        });
                    });
                });
            });
        });
    },
    'Delete key': function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'TM'});
        var tm = TM.create({idx: 'crap', keyname: 'custom'});
        test.equal(tm.key, 'TM!custom');
        tm.save(function (err) {
            test.ifError(err);
            TM.delete('TM!custom', function (err) {
                test.ifError(err);
                test.done();
            });
        });
    },
    "Don't default with value": function (test) {
        var TM = new VeryLevelModel({idx: {default: 'crap'}, required: true}, {db: db, prefix: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        test.done();
    },
    "Don't default function with value": function (test) {
        var TM = new VeryLevelModel({idx: {default: function () { return 'crap'; }, required: true}}, {db: db, prefix: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        var tmo = tm.toJSON();
        test.equals(tmo.idx, 'news');
        tm.save(function (err) {
            TM.load(tm.key, function (err, ntm) {
                test.equals(ntm.idx, 'news');
                test.done();
            });
        });

    },
    "Update shouldn't create a duplicate": function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'ND'});
        var tm = TM.create({idx: 'hi'});
        tm.save(function (err) {
            TM.update(tm.key, {idx: 'nope'}, function (err, ntm) {
                test.equals(tm.key, ntm.key);
                TM.all(function (err, tms) {
                    test.equals(tms.length, 1);
                    test.done();
                });
            });
        });
    },
    "Update shouldn't create a new if previous isn't found": function (test) {
        var TM = new VeryLevelModel({idx: {}}, {db: db, prefix: 'ND'});
        TM.update('xxx', {idx: 'hi'}, function (err, tm) {
            test.ok((err !== undefined));
            test.equals(typeof tm, 'undefined');
            test.done();
        });
    },
    "Indexes shouldn't get duplicated": function (test) {
        var TM = new VeryLevelModel({idx: {index: true}, name: {}}, {db: db, prefix: 'HAM'});
        var tm = TM.create({idx: 'nope', name: 'ham'});
        tm.save(function (err) {
            TM.update(tm.key, {name: 'cheese'}, function (err, ntm) {
                TM.update(ntm.key, {name: 'chowder'}, function (err, ntm2) {
                    TM.getByIndex('idx', 'nope', function (err, tms) {
                        test.equals(tms.length, 1);
                        test.done();
                    });
                });
            });
        });
    },
    "Deleting one index shouldn't delete all": function (test) {
        var TM = new VeryLevelModel({idx: {}, name: {index: true}}, {db: db, prefix: 'ATM'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 10;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: true});
                tm.save(acb);
            },
            function (err) {
                TM.getByIndex('name', true, function (err, tms) {
                    test.equals(tms.length, 10);
                    TM.update(tms[0].key, {name: false}, function (err, ntm) {
                        TM.getByIndex('name', true, function (err, tms) {
                            test.equals(tms[0].name, true);
                            test.equals(tms.length, 9);
                            test.done();
                        });
                    });
                });
            }
        );
    },
    "Test offset and limit": function (test) {
        var TM = new VeryLevelModel({idx: {}, name: {}}, {db: db, prefix: 'ARP'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 100;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: 'billy' + idx});
                tm.save(acb);
            },
            function (err) {
                TM.all({limit: 10, offset: 10}, function (err, tms) {
                    test.equals(tms[0].idx, 11);
                    test.equals(tms.length, 10);
                    test.equals(tms[9].idx, 20);
                    test.done();
                });
            }
        );
    },
    "onSave": function (test) {
        var XR = new VeryLevelModel({
            idx: {},
            name: {}
        }, {
            db: db,
            prefix: 'onsave',
            onSave: function (model, diff) {
                test.ok(diff.hasOwnProperty('name'));
                test.ok(!diff.hasOwnProperty('idx'));
                test.done();
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.name = 'Unbilly';
        tm.save(function (err) {
        });
    },
    "onDelete": function (test) {
        var XR = new VeryLevelModel({
            idx: {},
            name: {}
        }, {
            db: db,
            prefix: 'ondel',
            onDelete: function (model) {
                test.done();
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.save(function (err) {
            tm.delete(function (err) {
            });
        });
    },
};
