var VeryLevelModel = require('../index.js');
var level = require('level');
var db = level('./hi', {valueEncoding: 'json'});
var async = require('async');

var Person = new VeryLevelModel({
    first_name: {},
    last_name: {},
    full_name: {derive: function () {
        return this.first_name + ' ' + this.last_name;
    }, private: false},
    experience: {},
    title: {},
    twitter: {index: true}
}, {db: db, prefix: 'person'});

var jobs = 1000;
var idx = 0;

async.whilst(
    function () { return idx < jobs; }, 
    function (acb) {
        console.log(idx);
        var person = Person.create({first_name: idx, last_name: 'Fritz', twitter: 'user' + idx});
        person.save(acb);
        idx++;
    },
    function (err) {
        console.log(err, "done");
        Person.getByIndex('twitter', 'user4', function (err, persons) {
            console.log(persons.length);
        });
    }
);
