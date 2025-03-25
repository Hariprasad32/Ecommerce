const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => `ORD-${uuidv4().substring(0, 6).toUpperCase()}`, // Custom order ID
        unique: true
    },
    orderMainId: { 
        type: String,
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{ 
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        productImage: {
            type: String, 
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        size: {
            type: String,
            required: true
        },
        price: { 
            type: Number,
            required: true
        },
        finalPrice: { 
            type: Number,
            required: true
        },
        discount: { 
            type: Number,
            default: 0
        },
        status: { 
            type: String,
            required: true,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'],
            default: 'Pending'
        }
    }],
    shippingAddress: {
        name: { type: String, required: true },
        phone: { type: String, required: false },
        street: { type: String, required: false },
        landmark: { type: String, required: false },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        country: { type: String, default: 'India' }
    },
    paymentMethod: {
        type: String,
        required: true
    },
    totalAmount: { 
        type: Number,
        required: true
    },
    orderDate: {
        type: Date,
        default: Date.now,
        required: true
    },
    orderStatus: { 
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'],
        default: 'Pending'
    },
    paymentStatus: { 
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Paid', 'Failed'],
        default: 'Pending'
    },
    createdOn: { 
        type: Date,
        default: Date.now,
        required: true
    }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;