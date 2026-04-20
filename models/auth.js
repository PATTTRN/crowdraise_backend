const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    _id: mongoose.Schema.Types.ObjectId,
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 
            'Please fill a valid email address'
        ]
    },
    phone: { type: String, required: true },
    country: { type: String, required: false },
    password: { type: String, required: true },
    role: { type: String, required: true },
    createdAt: { type: Date, required: true }
})

module.exports = mongoose.model('User', userSchema)