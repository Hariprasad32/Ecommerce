const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Order = require("../../models/orderSchema")
const { v4: uuidv4 } = require('uuid');




const getOrders = async(req,res)=>{
    try {
        res.render('admin-orders')
        
    } catch (error) {
        
    }
}


module.exports ={
    getOrders
}