module.exports = function (mf) {
    mf.extendModel({
        hasKey: function (field, key) {
            if (Array.isArray(this[field])) {
                for (var idx = 0, length = this[field].length; idx < length; idx++) {
                    if (this[field][idx].key === key || this[field][idx] === key) {
                        return true;
                    }
                }
            } else if (typeof this[field] === 'object' && this[field].key) {
                return (this[field].key === key);
            } else {
                return (this[field] === key);
            }
        },
        hasInstance: function (field, inst) {
            return this.hasKey(field, inst.key);
        }
    });
};
