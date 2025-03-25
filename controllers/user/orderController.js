const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Order = require("../../models/orderSchema")
const { v4: uuidv4 } = require('uuid');




const getUserOrders = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId)

    
        const allOrders = await Order.find({ userId }).lean();
        if (!allOrders || allOrders.length === 0) {
            return res.render('my-orders', { orders: [] });
        }

        const groupedOrders = {};
        allOrders.forEach(order => {
            const mainId = order.orderMainId;
            if (!groupedOrders[mainId]) {
                groupedOrders[mainId] = {
                    orderId: order.orderId,
                    orderMainId: mainId,
                    totalAmount: 0,
                    orderDate: order.orderDate,
                    orderStatus: order.orderStatus,
                    paymentMethod: order.paymentMethod,
                    paymentStatus: order.paymentStatus,
                    itemCount: 0
                };
            }
            groupedOrders[mainId].totalAmount += order.totalAmount;
            groupedOrders[mainId].itemCount += order.items.length;
            
        });

        const orders = Object.values(groupedOrders);

        console.log("Grouped orders for user:", orders);

        res.render('orders', { orders,user:userData,page:'ordersPage' });

    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).send("Server error");
    }
};

const getCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId).lean();
        if (!userData) {
            return res.redirect('/404-page');
        }

        const cartData = await Cart.findOne({ userId: userId }).populate('items.productId').lean();
        const addressData = await Address.findOne({ userId: userId }).lean();
        const cartItems = cartData ? cartData.items : [];
        const addresses = addressData ? addressData.address : [];

        const subtotal = cartItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const discount = cartItems.reduce((sum, item) => {
            if (item.productId && item.productId.productOffer > 0) {
                return sum + (item.totalPrice * item.productId.productOffer / 100);
            }
            return sum;
        }, 0);

        const taxRate = 0;
        const shippingCost = 0;
        const tax = (subtotal - discount) * taxRate;
        const total = subtotal - discount + tax + shippingCost;

        res.render('checkout', {
            user: userData,
            addresses: addresses,
            cartItems: cartItems,
            totals: {
                subtotal: subtotal.toFixed(2),
                discount: discount.toFixed(2),
                tax: tax.toFixed(2),
                shipping: shippingCost.toFixed(2),
                total: total.toFixed(2)
            }
        });
    } catch (error) {
        console.error("Error in getCheckout:", error);
        res.redirect('/404-page');
    }



};

const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        console.log("Received addressId:", addressId);
        const userId = req.session.user

        if (!addressId || paymentMethod !== 'cod') {
            return res.status(400).json({
                success: false,
                message: 'Address is required and payment method must be Cash on Delivery'
            });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
        });
        // console.log("User ID:", userId);
        // console.log("Found cart:", cart ? "exists" : "null");
        // console.log("Cart items length:", cart ? cart.items.length : "N/A");

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const addressDoc = await Address.findOne({ "address._id": addressId });
        console.log("Found address document:", addressDoc);
        if (!addressDoc) {
            return res.status(400).json({ success: false, message: 'Invalid shipping address' });
        }

        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        console.log("Selected address:", selectedAddress);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Address not found in document' });
        }

        const orderDate = new Date();
        const orderStatus = 'Pending';
        const paymentStatus = 'Pending'; 
        const ordersMainId = uuidv4().substring(0, 8).toUpperCase();
        const orders = [];

        for (const item of cart.items) {
            const product = item.productId;
            const size = item.sizes[0];

            if (!product || typeof product.regularPrice !== 'number') {
                console.error("Invalid product data:", product);
                return res.status(500).json({
                    success: false,
                    message: `Invalid product data for ${product?.productName || 'unknown product'}`
                });
            }

            const productPrice = product.regularPrice || 0;
            const discountPercentage = product.productOffer || 0;
            const discountAmount = (productPrice * discountPercentage) / 100;
            const finalPrice = productPrice - discountAmount;
            const totalAmount = finalPrice * size.quantity;

            console.log(`Item: ${product.productName}, Price: ${productPrice}, Discount: ${discountPercentage}%, Final Price: ${finalPrice}, Total: ${totalAmount}`);

            const productInDb = await Product.findById(product._id);
            const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);

            if (sizeIndex === -1 || productInDb.sizes[sizeIndex].quantity < size.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.productName} in size ${size.size}`
                });
            }

            const newOrder = new Order({
                orderId: `ORD-${uuidv4().substring(0, 6).toUpperCase()}`,
                orderMainId: ordersMainId,
                userId,
                items: [{
                    productId: product._id,
                    productName: product.productName || 'Unknown Product',
                    productImage: product.productImage && product.productImage[0] ? product.productImage[0] : '',
                    quantity: size.quantity,
                    size: size.size,
                    price: productPrice,
                    finalPrice,
                    discount: discountPercentage
                }],
                shippingAddress: {
                    name: selectedAddress.name,
                    phone: selectedAddress.phone || '',
                    street: selectedAddress.street || '',
                    landmark: selectedAddress.landMark,
                    city: selectedAddress.city,
                    state: selectedAddress.state,
                    pincode: selectedAddress.pincode,
                    country: selectedAddress.country || 'India'
                },
                paymentMethod: 'cod',
                totalAmount,
                orderDate,
                orderStatus,
                paymentStatus
            });

            await newOrder.save();
            orders.push(newOrder);

            productInDb.sizes[sizeIndex].quantity -= size.quantity;
            await productInDb.save();
        }

        cart.items = [];
        await cart.save();

        return res.status(200).json({
            success: true,
            message: 'Orders placed successfully',
            orderId: ordersMainId,
            orders: orders.map(order => order.orderId)
        });

    } catch (error) {
        console.error('Error placing order:', error);
        return res.status(500).json({ success: false, message: 'An error occurred while placing your order' });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id; 
        const userId = req.session.user;

       
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login')
            
        }

        
        const orders = await Order.find({ orderMainId: orderId, userId }).lean();
        if (!orders || orders.length === 0) {
            return res.status(404).send("Order not found");
        }

        // console.log("orders reaching order-detail page", orders);

       
        const allOrderItems = orders.flatMap(order => 
            order.items.map(item => ({
                productId: {
                    _id: item.productId,
                    productName: item.productName,
                    productImage: item.productImage 
                },
                price: item.price,
                quantity: item.quantity,
                size: item.size,
                status: order.orderStatus 
            }))
        );  
        // console.log("this are the order items",allOrderItems);
        
       
        const primaryOrder = orders[0];

        
        res.render("order-details", {
            orders: {
                orderId:primaryOrder.orderId,
                orderid: primaryOrder.orderMainId,
                status: primaryOrder.orderStatus,
                paymentMethod: primaryOrder.paymentMethod,
                orderDate: primaryOrder.orderDate,
                finalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
                orderitems: allOrderItems,
                paymentStatus: primaryOrder.paymentStatus
            },
            address: primaryOrder.shippingAddress,
            user: user
        });

    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).send("Server error");
    }
};
const orderSuccess = async (req,res)=>{
    const orderId = req.query.orderId;
    res.render('order-success', { orderId });
}

const cancelOrder = async (req, res) => {
    try {
        console.log("Cancel request reached here");
    
        const { orderId, productId } = req.body; 
        const userId = req.session.user;

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        let allItemsCancelled = true;
        let cancelledQuantity = 0;
        order.items = order.items.map(item => {
            if (item.productId.toString() === productId) {
                if (item.status !== 'Cancelled') {
                    item.status = 'Cancelled';
                    cancelledQuantity = item.quantity; 
                }
            }
            if (item.status !== 'Cancelled') {
                allItemsCancelled = false; 
            }
            return item;
        });

        if (cancelledQuantity === 0) {
            return res.status(400).json({ success: false, message: 'Item already cancelled or not found' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.stock += cancelledQuantity; 
        await product.save();

        // Only set the order status to 'Cancelled' if all items are cancelled
        if (allItemsCancelled) {
            order.orderStatus = 'Cancelled';
        }

        await order.save();

        return res.json({ success: true, message: 'Item cancelled successfully and stock updated' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }

};


const submitReturnRequest = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason, comments } = req.body;
        const userId = req.session.user;
        
       
        const orders = await Order.find({ orderMainId: orderId, userId });
        
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
    
        await Order.updateMany(
            { orderMainId: orderId, userId }, 
            { 
                $set: { 
                    orderStatus: 'Return Request',
                    'returnDetails.reason': reason,
                    'returnDetails.comments': comments,
                    'returnDetails.requestDate': new Date()
                } 
            }
        );
        
        return res.json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error submitting return request:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getCheckout,
    placeOrder,
    getOrderDetails,
    orderSuccess,
    getUserOrders,
    cancelOrder,
    submitReturnRequest

};