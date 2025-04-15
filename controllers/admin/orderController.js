const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Order = require("../../models/orderSchema");
const { v4: uuidv4 } = require('uuid');



const getOrders = async (req, res) => {
    try {
        const { page = 1, search = '', status = 'all' } = req.query;
        const limit = 6;
        const skip = (page - 1) * limit;

        let query = {};

        
        if (search) {
            query.$or = [
                { orderMainId: { $regex: search, $options: 'i' } },
            ];
            const users = await User.find({
                username: { $regex: search, $options: 'i' }
            }).select('_id');
            const userIds = users.map(user => user._id);
            query.$or.push({ userId: { $in: userIds } });
        }

       
        if (status !== 'all') {
           
            const itemStatus = status === 'Return Requested' ? 'Return Request' : status;
            query.items = {
                $elemMatch: {
                    status: itemStatus
                }
            };
        }

        const orders = await Order.find(query)
            .populate('userId', 'username email')
            .sort({ orderDate: -1 })
            .skip(skip)
            .limit(limit);

        console.log("Orders reaching the order info page:", orders);

        if (!orders || orders.length === 0) {
            return res.render('admin-orders', {
                orders: [],
                page: 'Orders',
                currentPage: parseInt(page),
                totalPages: 1,
                searchQuery: search,
                statusFilter: status
            });
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('admin-orders', {
            orders: orders,
            page: 'Orders',
            currentPage: parseInt(page),
            totalPages,
            searchQuery: search,
            statusFilter: status
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error-page', {
            message: 'Failed to load orders',
            error: error.message
        });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid order status' 
            });
        }

     
        const result = await Order.updateMany(
            { _id: orderId },
            { $set: { orderStatus: status } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Order status updated successfully',
            newStatus: status 
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status',
            error: error.message 
        });
    }
};

const updateProductItemStatus = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { status, itemIndex } = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid product status' 
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

      
        const itemIndexNum = parseInt(itemIndex);
        if (itemIndexNum >= 0 && itemIndexNum < order.items.length) {
           
            order.items[itemIndexNum].status = status;
            await order.save();

           
            const allItemsHaveSameStatus = order.items.every(item => item.status === status);
            if (allItemsHaveSameStatus) {
                order.orderStatus = status;
                await order.save();
            }

           
            if (status === 'Cancelled') {
                const item = order.items[itemIndexNum];
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { stockQuantity: item.quantity }
                });
            }

            res.json({ 
                success: true, 
                message: 'Product status updated successfully',
                newStatus: status 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                message: 'Invalid item index'
            });
        }
    } catch (error) {
        console.error('Error updating product status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update product status',
            error: error.message 
        });
    }
};

const processReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { action, itemIndex } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndexNum = parseInt(itemIndex);
        if (itemIndexNum < 0 || itemIndexNum >= order.items.length) {
            return res.status(400).json({ success: false, message: 'Invalid item index' });
        }

        const item = order.items[itemIndexNum];
        if (item.status !== 'Return Request') {
            return res.status(400).json({ success: false, message: 'No return request found for this item' });
        }

        console.log("these are the items",item)
        if (action === 'approve') {
            item.status = 'Returned';

            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }
            
            
            const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
            if (sizeIndex !== -1) {
                product.sizes[sizeIndex].quantity += item.quantity;
                await product.save();
            }
            const refundAmount = item.finalPrice * item.quantity;
            if (item.refunded) {
                return res.status(400).json({ success: false, message: 'Refund already processed for this item' });
            }

            const user = await User.findById(order.userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

           
            await User.findByIdAndUpdate(order.userId, {
                $inc: { wallet: refundAmount },
                $push: {
                    walletTransactions: {
                        amount: refundAmount,
                        type: 'credit',
                        description: `Refund for ${item.productName} (Order ${order.orderId})`
                    }
                }
            });

            item.refunded = true;
            const allItemsReturned = order.items.every(i => i.status === 'Returned');
            if (allItemsReturned) {
                order.orderStatus = 'Returned';
            }

            await order.save();

            res.json({
                success: true,
                message: `Return request approved successfully. $${refundAmount.toFixed(2)} refunded to wallet.`,
                newStatus: item.status
            });
        } else if (action === 'reject') {
            item.status = 'Return Rejected';
            await order.save();

            res.json({
                success: true,
                message: 'Return request rejected successfully',
                newStatus: item.status
            });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error processing return request:', error);
        res.status(500).json({ success: false, message: 'Failed to process return request', error: error.message });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        const order = await Order.find({ orderId: orderId })
            .populate('userId', 'name email')
            .sort({ orderDate: -1 });
            // console.log("this is the order",order)

        if (!order || order.length === 0) {
            return res.status(404).render('error-page', { 
                message: 'Order not found' 
            });
        }

     
        for (let orderItem of order) {
            for (let item of orderItem.items) {
                // console.log("this are the items",item)
               
                if (item.productId) {
                    const product = await Product.findById(item.productId).select('image');
                    if (product && product.image) {
                        item.productImage = product.image;
                    }
                }
                
               
                if (item.finalPrice === undefined) {
                    item.finalPrice = item.finalprice || 0;
                }
            }
        }

        res.render('admin-orderDetail', { order, page: 'Orders' });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error-page', { 
            message: 'Failed to load order details', 
            error: error.message 
        });
    }
};

module.exports = {
    getOrders,
    updateOrderStatus,
    updateProductItemStatus,
    processReturnRequest,
    getOrderDetails
};