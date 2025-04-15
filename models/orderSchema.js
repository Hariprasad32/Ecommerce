const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default : ()=>uuidv4(),
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
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Return Accepted', 'Return Rejected'],
            default: 'Pending'
        },
        refunded: {
            type: Boolean,
            default: false
        },
        returnReason: {
            type: String,
            required: false
        },
        returnComments: { 
            type: String,
            required: false
        },
        returnRequestDate: { 
            type: Date,
            required: false
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
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned','Partially Cancelled'],
        default: 'Pending'
    },
    paymentStatus: { 
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Paid', 'Failed','Cancelled'],
        default: 'Pending'
    },
    couponDiscount:{
        type:Number,
        default:0
    },
    createdOn: { 
        type: Date,
        default: Date.now,
        required: true
    }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;