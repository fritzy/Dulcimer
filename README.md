    var VeryLevelModel = require('verymodel-level');
    var level = require('level');
    var db = level('./hi', {valueEncoding: 'json'});

    var Person = new VeryLevelModel({
        first_name: {},
        last_name: {},
        full_name: {derive: function () {
            return this.first_name + ' ' + this.last_name;
            }, private: false},
        experience: {},
        title: {},
    }, {db: db, prefix: 'person!'});


    var gar = Person.create({
        first_name: 'Michael', 
        last_name: 'Garvin',
    });


    gar.save(function (err) {
        Person.load(gar.key, function (err, person) {
            console.log(person.toJSON());
            console.log(person.key);
        });
    });

    Person.all(function (err, objs) {
        objs.forEach(function (person) {
            console.log("=-=-=-=-=-=");
            console.log(person.toJSON({withPrivate: true}));
        });
    });
