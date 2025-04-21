const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Order = require("../../models/orderSchema")
const Coupon = require("../../models/couponSchema")
const Razorpay = require('razorpay');
const PDFDocument = require('pdfkit');
const {
    v4: uuidv4
} = require('uuid');
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

require('dotenv').config();

const getUserOrders = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }
        
        const userData = await User.findById(userId);
        const page = Math.max(1, parseInt(req.query.page) || 1); 
        const limit = Math.max(1, parseInt(req.query.limit) || 6);
        const search = req.query.search ? req.query.search.trim() : '';
        const statusFilter = req.query.status || '';
        
      
        let query = { userId };
        
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.orderMainId = searchRegex;
        }
        
        if (statusFilter) {
            query.orderStatus = statusFilter;
        }
        
      
        const distinctMainIds = await Order.distinct('orderMainId', query);
        
     
        const sortedMainIds = await Order.aggregate([
            { $match: { orderMainId: { $in: distinctMainIds } } },
            { $sort: { orderDate: -1 } },
            { $group: { _id: "$orderMainId", orderDate: { $first: "$orderDate" } } },
            { $sort: { orderDate: -1 } },
            { $project: { _id: 1 } }
        ]);
        
        const mainIds = sortedMainIds.map(item => item._id);
        const totalOrders = mainIds.length;
        const totalPages = Math.max(1, Math.ceil(totalOrders / limit));
        
       
        if (page > totalPages && totalPages > 0) {
            return res.redirect(`/orders?page=${totalPages}&limit=${limit}&search=${encodeURIComponent(search)}&status=${statusFilter}`);
        }
        
        
        const paginatedMainIds = mainIds.slice((page - 1) * limit, page * limit);
        
       
        const orders = await Order.find({ 
            orderMainId: { $in: paginatedMainIds } 
        }).sort({ orderDate: -1 }).lean();
        
      
        const groupedOrders = {};
        orders.forEach(order => {
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
                    itemCount: 0,
                    items: []
                };
            }
            groupedOrders[mainId].totalAmount += order.totalAmount || 0;
            groupedOrders[mainId].itemCount += order.items.length;
            groupedOrders[mainId].items.push(...order.items);
        });
        
       
        const paginatedOrders = Object.values(groupedOrders);
        
        res.render('orders', {
            orders: paginatedOrders,
            user: userData,
            page: 'ordersPage',
            search,
            status: statusFilter,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalOrders: totalOrders,
                limit: limit
            }
        });
        
    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).render('error', {
            message: 'Server error while fetching orders',
            error: error.message
        });
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

        const cartData = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage regularPrice salePrice productOffer sizes'
            })
            .lean();

        if (!cartData || !cartData.items.length) {
            return res.redirect('/cart');
        }


        const cartItems = cartData.items.map(item => {
            const product = item.productId;
            const regularPrice = product.regularPrice || product.salePrice;
            const salePrice = product.salePrice || product.regularPrice;

            return {
                ...item,
                sizes: item.sizes.map(size => {
                    const discount = (regularPrice - salePrice) * size.quantity; 
                    const totalPrice = salePrice * size.quantity; 
                    return {
                        size: size.size,
                        quantity: size.quantity,
                        regularPrice,
                        salePrice,
                        discount,
                        totalPrice 
                    };
                })
            };
        });

        // Prepare checkout items for frontend
        const checkoutItems = [];
        cartItems.forEach(item => {
            item.sizes.forEach(size => {
                checkoutItems.push({
                    productId: item.productId._id,
                    productName: item.productId.productName,
                    productImage: item.productId.productImage[0] || '',
                    size: size.size,
                    quantity: size.quantity,
                    regularPrice: size.regularPrice,
                    salePrice: size.salePrice,
                    discount: size.discount,
                    totalPrice: size.totalPrice, 
                    productOffer: item.productId.productOffer || 0
                });
            });
        });

        const addressData = await Address.findOne({ userId }).lean();
        const addresses = addressData ? addressData.address : [];

        // Calculate totals
        const regularTotal = checkoutItems.reduce((sum, item) => sum + (item.regularPrice * item.quantity), 0); 
        const subtotal = checkoutItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const totalDiscount = checkoutItems.reduce((sum, item) => sum + (item.discount || 0), 0);
        const shippingCost =  40; 
        const total = subtotal + shippingCost;

        res.render('checkout', {
            user: userData,
            addresses,
            cartItems: checkoutItems,
            totals: {
                regularTotal: regularTotal.toFixed(2), 
                discount: totalDiscount.toFixed(2),
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
        const { addressId, paymentMethod, couponCode, amount, couponDiscount } = req.body;
        const userId = req.session.user;

        console.log("PlaceOrder - Input:", { userId, addressId, paymentMethod, amount, couponCode, couponDiscount });

        if (!userId) {
            console.error("PlaceOrder - No user session");
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!addressId || !paymentMethod) {
            console.error("PlaceOrder - Missing address or payment method");
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            console.error("PlaceOrder - Cart empty or not found");
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        const addressDoc = await Address.findOne({ "address._id": addressId });
        if (!addressDoc) {
            console.error("PlaceOrder - Invalid address ID:", addressId);
            return res.status(400).json({
                success: false,
                message: 'Invalid shipping address'
            });
        }

        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) {
            console.error("PlaceOrder - Address not found in document");
            return res.status(400).json({
                success: false,
                message: 'Address not found in document'
            });
        }

        // Validate stock
        for (const item of cart.items) {
            const product = item.productId;
            for (const size of item.sizes) {
                const productInDb = await Product.findById(product._id);
                const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);
                if (sizeIndex === -1 || productInDb.sizes[sizeIndex].quantity < size.quantity) {
                    console.error("PlaceOrder - Stock issue:", product.productName, size.size);
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${product.productName} in size ${size.size}`
                    });
                }
            }
        }

        // Validate coupon
        let appliedCoupon = null;
        let totalCouponDiscount = parseInt(couponDiscount) || 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({
                name: couponCode,
                isListed: true,
                expireOn: { $gte: new Date() }
            });
            if (!coupon) {
                console.error("PlaceOrder - Invalid coupon:", couponCode);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired coupon'
                });
            }
            const subtotal = cart.items.reduce((sum, item) => {
                return sum + item.sizes.reduce((s, size) => {
                    const price = item.productId.salePrice || item.productId.regularPrice;
                    return s + price * size.quantity;
                }, 0);
            }, 0);
            if (subtotal < coupon.minimumPrice) {
                console.error("PlaceOrder - Coupon minimum not met:", coupon.minimumPrice, subtotal);
                return res.status(400).json({
                    success: false,
                    message: `Coupon requires a minimum order of ₹${coupon.minimumPrice}`
                });
            }
            appliedCoupon = coupon;
            if (totalCouponDiscount !== coupon.offerPrice) {
                console.error("PlaceOrder - Coupon discount mismatch:", totalCouponDiscount, coupon.offerPrice);
                return res.status(400).json({
                    success: false,
                    message: 'Coupon discount mismatch'
                });
            }
        }

        // Validate wallet balance for wallet payment
        let user;
        if (paymentMethod === 'wallet') {
            user = await User.findById(userId).select('wallet');
            if (!user) {
                console.error("PlaceOrder - User not found:", userId);
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }
            if (user.wallet < amount || amount <= 0) {
                console.error("PlaceOrder - Invalid wallet balance:", user.wallet, amount);
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. Required: ₹${amount.toFixed(2)}, Available: ₹${user.wallet.toFixed(2)}`
                });
            }
        }

        const orderDate = new Date();
        const ordersMainId = uuidv4().substring(0, 8).toUpperCase();
        let totalOrderAmount = 0;
        let totalProductDiscount = 0;

        // Calculate order details with discounts from regularPrice
        const orderDetails = cart.items.flatMap(item => {
            const product = item.productId;
            const regularPrice = product.regularPrice || product.salePrice;
            const salePrice = product.salePrice || product.regularPrice;

            return item.sizes.map(size => {
                const productPrice = salePrice;
                const totalAmount = productPrice * size.quantity; // Based on salePrice
                const discount = (regularPrice - salePrice) * size.quantity; // Discount from regularPrice
                totalOrderAmount += totalAmount;
                totalProductDiscount += discount;
                return {
                    product,
                    size,
                    productPrice,
                    finalPrice: productPrice, // salePrice before coupon discount
                    totalAmount,
                    discount
                };
            });
        });

        console.log("PlaceOrder - Subtotal:", totalOrderAmount, "Product Discount:", totalProductDiscount);

        const SHIPPING_COST =  40;

        // Calculate total items (considering quantities)
        const totalItems = orderDetails.reduce((sum, detail) => sum + detail.size.quantity, 0);
        const perItemCouponDiscount = totalCouponDiscount > 0 ? Math.floor(totalCouponDiscount / totalItems) : 0;
        let remainingCouponDiscount = totalCouponDiscount - (perItemCouponDiscount * totalItems);

        const orders = [];
        let appliedCouponDiscount = 0;
        let itemIndex = 0;

        // Create orders with coupon discount applied as whole numbers
        for (const detail of orderDetails) {
            const product = detail.product;
            const size = detail.size;
            const productPrice = detail.productPrice;
            let finalPrice = productPrice;
            let totalAmount = productPrice * size.quantity;

            // Apply coupon discount as whole number
            if (totalCouponDiscount > 0) {
                let itemCouponDiscount = perItemCouponDiscount * size.quantity;
                // Apply remaining discount to the last item
                if (itemIndex === totalItems - size.quantity) {
                    itemCouponDiscount += remainingCouponDiscount;
                }
                totalAmount -= itemCouponDiscount;
                finalPrice = totalAmount / size.quantity;
                appliedCouponDiscount += itemCouponDiscount;
            }

            const productInDb = await Product.findById(product._id);
            const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);

            const newOrder = new Order({
                orderId: uuidv4(),
                orderMainId: ordersMainId,
                userId,
                items: [{
                    productId: product._id,
                    productName: product.productName,
                    productImage: product.productImage[0] || '',
                    quantity: size.quantity,
                    size: size.size,
                    price: productPrice,
                    finalPrice,
                    discount: (product.regularPrice - product.salePrice) * size.quantity, // Product discount
                    status: 'Pending'
                }],
                shippingAddress: {
                    name: selectedAddress.name,
                    phone: selectedAddress.phone || '',
                    street: selectedAddress.street || '',
                    landmark: selectedAddress.landMark || '',
                    city: selectedAddress.city,
                    state: selectedAddress.state,
                    pincode: selectedAddress.pincode,
                    country: selectedAddress.country || 'India'
                },
                paymentMethod,
                totalAmount,
                couponDiscount: totalCouponDiscount > 0 ? (perItemCouponDiscount * size.quantity + (itemIndex === totalItems - size.quantity ? remainingCouponDiscount : 0)) : 0,
                orderDate,
                orderStatus: 'Pending',
                paymentStatus: paymentMethod === 'wallet' ? 'Paid' : 'Pending',
                createdOn: new Date()
            });
            for (const detail of orderDetails) {
                const product = detail.product;
                const size = detail.size;
                
                const productInDb = await Product.findById(product._id);
                const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);
            
               
                if (paymentMethod !== 'razorpay' || (paymentMethod === 'razorpay' && newOrder.paymentStatus === 'Paid')) {
                    productInDb.sizes[sizeIndex].quantity -= size.quantity;
                    await productInDb.save();
                }
            }

            await newOrder.save();
            console.log("PlaceOrder - Order saved:", newOrder._id, newOrder.orderId);

            orders.push(newOrder);

            productInDb.sizes[sizeIndex].quantity -= size.quantity;
            await productInDb.save();

            itemIndex += size.quantity;
        }

       
          

        // Update wallet for wallet payment
        if (paymentMethod === 'wallet') {
            console.log("PlaceOrder - Attempting wallet deduction:", { userId, amount });
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                {
                    $inc: { wallet: -amount },
                    $push: {
                        walletTransactions: {
                            amount: -amount,
                            type: 'debit',
                            description: `Payment for order #${ordersMainId}`,
                            date: new Date()
                        }
                    }
                },
                { new: true, runValidators: true }
            );
            if (!updatedUser) {
                console.error("PlaceOrder - Wallet update failed: User not found");
                await Order.deleteMany({ orderMainId: ordersMainId });
                return res.status(500).json({
                    success: false,
                    message: 'Failed to update wallet: User not found'
                });
            }
            console.log("PlaceOrder - Wallet updated:", {
                newBalance: updatedUser.wallet,
                transaction: `Payment for order #${ordersMainId}`
            });
        }

        // Update user order history
        const orderIds = orders.map(order => order._id);
        await User.findByIdAndUpdate(userId, {
            $push: { orderHistory: { $each: orderIds } }
        });
        console.log("PlaceOrder - Order history updated:", orderIds);

        // Clear cart
        cart.items = [];
        await cart.save();
        console.log("PlaceOrder - Cart cleared");

        // Validate total amount
        const subtotalAfterDiscount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const calculatedTotal = subtotalAfterDiscount + SHIPPING_COST;

        console.log("PlaceOrder - Totals:", {
            subtotalAfterDiscount,
            totalProductDiscount,
            shippingCost: SHIPPING_COST,
            calculatedTotal,
            clientAmount: amount
        });

        if (Math.abs(calculatedTotal - amount) > 0.01) {
            console.error("PlaceOrder - Amount mismatch:", calculatedTotal, amount);
            return res.status(400).json({
                success: false,
                message: `Total amount mismatch. Expected: ₹${calculatedTotal.toFixed(2)}, Received: ₹${amount.toFixed(2)}`
            });
        }

        if (paymentMethod === 'razorpay') {
            console.log("PlaceOrder - Razorpay response");
            return res.status(200).json({
                success: true,
                message: 'Proceed to payment',
                orderId: ordersMainId,
                amount: calculatedTotal,
                orderDetails: {
                    addressId,
                    couponCode,
                    orderDate
                }
            });
        }

        console.log("PlaceOrder - Success response for:", paymentMethod);
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: ordersMainId
        });
    } catch (error) {
        console.error("PlaceOrder - Error:", error.message, error.stack);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while placing your order',
            error: error.message
        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderMainId = req.params.id;
        const orders = await Order.find({ orderMainId }).populate('items.productId');
        if (!orders.length) {
            return res.status(404).render('404-page', { message: 'Order not found' });
        }

        const SHIPPING_COST = 40; 
        const subtotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const finalAmount = subtotal + SHIPPING_COST; 

        const address = orders[0].shippingAddress;

        res.render('order-details', {
            orders: {
                orderid: orderMainId,
                status: orders[0].orderStatus,
                paymentMethod: orders[0].paymentMethod,
                paymentStatus: orders[0].paymentStatus,
                orderDate: orders[0].orderDate,
                orderitems: orders.map(order => ({
                    orderId: order.orderId,
                    productId: order.items[0].productId,
                    size: order.items[0].size,
                    quantity: order.items[0].quantity,
                    price: order.items[0].finalPrice,
                    status: order.items[0].status
                })),
                subtotal: subtotal,
                shippingCost: SHIPPING_COST,
                finalAmount: finalAmount
            },
            address,
            user: req.session.user || { name: 'User', email: 'user@example.com' } 
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).render('404-page', { message: 'Server error' });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const orderId = req.query.orderId;

        res.render('order-success', {
            orderId: orderId
        });
    } catch (error) {
        console.log * ("error in order success", error)
        res.redirect('/404-page');

    }
};

const updatePaymentStatus = async (order) => {

    if (order.paymentMethod === 'cod') {
        switch (order.orderStatus) {
            case 'Pending':
                order.paymentStatus = 'Pending';
                break;
            case 'Cancelled':
                order.paymentStatus = 'Cancelled';
                break;
            case 'Delivered':
                order.paymentStatus = 'Paid';
                break;
            default:
                order.paymentStatus = 'Processing';
        }
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId, productId, orderMainId } = req.body;

        if (!orderId  || !orderMainId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required IDs'
            });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const itemToCancel = order.items.find(
            item => item.productId.toString() === productId && ['Pending', 'Processing', 'Confirmed'].includes(item.status)
        );

        if (!itemToCancel) {
            return res.status(400).json({
                success: false,
                message: `Item not found or not eligible for cancellation. Current status: ${order.items.find(i => i.productId.toString() === productId)?.status || 'unknown'}`
            });
        }

        itemToCancel.status = 'Cancelled';

        const product = await Product.findById(productId);
        if (product) {
            if (itemToCancel.size && product.sizes) {
                const sizeEntry = product.sizes.find(s => s.size === itemToCancel.size);
                if (sizeEntry) {
                    sizeEntry.quantity += itemToCancel.quantity;
                }
            }
            await product.save();
        }

        const refundAmount = itemToCancel.finalPrice * itemToCancel.quantity;

        const user = await User.findById(order.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        await User.findByIdAndUpdate(order.userId, {
            $inc: { wallet: refundAmount },
            $push: {
                walletTransactions: {
                    amount: refundAmount,
                    type: "credit",
                    description: `Refund for cancelled order ${itemToCancel.productName} (Order:${order.orderId})`
                }
            }
        });

        order.activeTotalAmount = order.items.reduce(
            (total, item) => total + (item.status !== 'Cancelled' ? item.finalPrice * item.quantity : 0),
            0
        );

        await order.save();

        const relatedOrders = await Order.find({ orderMainId });
        const statusUpdate = calculateOrderStatus(relatedOrders);

        if (statusUpdate.needsUpdate) {
            await Order.updateMany(
                { orderMainId },
                { $set: { orderStatus: statusUpdate.newStatus } }
            );
        }

        res.json({
            success: true,
            message: 'Item cancelled successfully',
            newStatus: statusUpdate.newStatus,
            totalAmount: order.activeTotalAmount,
            originalTotalAmount: order.totalAmount
        });

    } catch (error) {
        console.error('Cancel error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during cancellation',
            error: error.message
        });
    }
};

function calculateOrderStatus(orders) {
    let hasPending = false;
    let allNonPending = true;

    orders.forEach(order => {
        order.items.forEach(item => {
            if (item.status === 'Pending') {
                hasPending = true;
            } else {
               
                hasPending = hasPending || false;
            }
        });
    });

  
    if (hasPending) {
        return {
            newStatus: 'Processing',
            needsUpdate: orders.some(o => o.orderStatus !== 'Processing')
        };
    }

   
    if (allNonPending) {
        return {
            newStatus: 'Completed',
            needsUpdate: orders.some(o => o.orderStatus !== 'Completed')
        };
    }

    // Default case (should rarely occur)
    return {
        newStatus: 'Pending',
        needsUpdate: orders.some(o => o.orderStatus !== 'Pending')
    };
}

const submitReturnRequest = async (req, res) => {
    try {
        const { orderId, productId, reason, comments } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const item = order.items.find(i => i.productId.toString() === productId);
        if (!item || item.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Item not eligible for return'
            });
        }

        
        item.status = 'Return Request';
        item.returnReason = reason;
        item.returnComments = comments;
        item.returnRequestDate = new Date();

        await updatePaymentStatus(order); 
        await order.save();

        return res.json({
            success: true,
            message: 'Return request submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting return request:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

const downloadPdf = async (req, res) => {
    try {
        const orders = await Order.find({ orderMainId: req.params.orderId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage'
            })
            .populate('userId', 'name email')
            .lean();

        if (!orders || orders.length === 0) {
            return res.status(404).json({ message: 'No orders found for this orderMainId' });
        }

        const fileName = `Invoice_${req.params.orderId}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-Type', 'application/pdf');

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        const colors = {
            myntra: '#FF3F6C',
            myntraG: '#14CAD8',
            primary: '#2D3748',
            secondary: '#718096',
            accent: '#3182CE',
            light: '#EDF2F7',
            border: '#CBD5E0',
            success: '#48BB78',
            highlight: '#F6AD55'
        };

        const drawHorizontalLine = (y) => {
            doc.strokeColor(colors.border).lineWidth(1)
                .moveTo(50, y).lineTo(550, y).stroke();
        };

        const formatCurrency = (amount) => `₹${parseFloat(amount).toFixed(2)}`;

        
        doc.fontSize(24).fillColor(colors.primary).text('Wear Aura', { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor(colors.secondary).text('Premium Fashion Store', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(16).fillColor(colors.primary).text('INVOICE', { align: 'center' });

       
        const leftX = 50;
        doc.fontSize(10).fillColor(colors.secondary).text('BILLED TO:', leftX, doc.y);
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor(colors.primary).text(orders[0].userId.name, leftX, doc.y + 15);
        doc.fontSize(10).fillColor(colors.secondary).text(orders[0].userId.email, leftX, doc.y + 15);

        const rightX = 350;
        doc.fontSize(10).fillColor(colors.secondary).text('INVOICE DETAILS:', rightX, 145);
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor(colors.primary)
            .text(`Invoice #: ${req.params.orderId}`, rightX, doc.y);
        doc.fontSize(10).fillColor(colors.secondary)
            .text(`Date: ${new Date(orders[0].orderDate).toLocaleDateString()}`, rightX, doc.y + 15)
            .text(`Payment Method: ${orders[0].paymentMethod === 'cod' ? 'Cash on Delivery' : orders[0].paymentMethod}`, rightX, doc.y + 15);
        doc.moveDown(2);

        
        doc.fontSize(10).fillColor(colors.secondary).text('SHIPPING ADDRESS:', leftX, doc.y);
        doc.moveDown(0.5);
        const address = orders[0].shippingAddress;
        doc.fontSize(12).fillColor(colors.primary).text(address.name, leftX, doc.y);
        doc.fontSize(10).fillColor(colors.secondary)
            .text(`${address.street || ''}${address.street && address.landmark ? ', ' : ''}${address.landmark || ''}`, leftX, doc.y + 15)
            .text(`${address.city}, ${address.state}, ${address.pincode}`, leftX, doc.y + 30)
            .text(`Phone: ${address.phone || 'N/A'}`, leftX, doc.y + 45);
        doc.moveDown(2);

        
        const tableTop = doc.y;
        doc.rect(50, tableTop, 500, 20).fill(colors.light);
        doc.fillColor(colors.primary).fontSize(10);

        const colProduct = 60, colSize = 260, colQty = 330, colPrice = 400, colTotal = 480;
        doc.text('PRODUCT', colProduct, tableTop + 5)
            .text('SIZE', colSize, tableTop + 5)
            .text('QTY', colQty, tableTop + 5)
            .text('PRICE', colPrice, tableTop + 5)
            .text('TOTAL', colTotal, tableTop + 5);

        doc.moveDown(1);

       
        let itemY = doc.y;
        orders.forEach((order, orderIndex) => {
            order.items.forEach((item, i) => {
                const y = itemY + ((orderIndex * order.items.length + i) * 30);

                if ((orderIndex * order.items.length + i) % 2 === 0) {
                    doc.rect(50, y - 5, 500, 30).fill('#F7FAFC');
                }
                doc.fillColor(colors.primary);

                const productName = item.productName || item.productId?.productName || 'Unknown';
                const displayName = productName.length > 25 ? productName.substring(0, 22) + '...' : productName;

                doc.text(displayName, colProduct, y)
                    .text(item.size || 'N/A', colSize, y)
                    .text(item.quantity.toString(), colQty, y)
                    .text(formatCurrency(item.finalPrice), colPrice, y)
                    .text(formatCurrency(item.finalPrice * item.quantity), colTotal, y);
            });
            itemY += order.items.length * 30;
        });

        doc.moveDown(1);
        drawHorizontalLine(doc.y);
        doc.moveDown(1);

       
        const deliveryCharge = orders[0].totalAmount > 500 ? 0 : 88;
        const summaryX = 380, valueX = 500;
        const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const couponDiscount = orders[0].couponDiscount || 0;
        const itemDiscount = orders.reduce((sum, order) => sum + order.items.reduce((acc, item) => acc + (item.discount || 0), 0), 0);
        const totalDiscount = couponDiscount + itemDiscount;
        const finalAmount = totalAmount + deliveryCharge - totalDiscount;

        doc.rect(summaryX - 30, doc.y - 10, 200, 100).fill(colors.light);

        doc.fontSize(10).fillColor(colors.secondary).text('Subtotal:', summaryX, doc.y);
        doc.fontSize(10).fillColor(colors.primary).text(formatCurrency(totalAmount), valueX, doc.y - 10, { align: 'left' });

        doc.fontSize(10).fillColor(colors.secondary).text('Delivery:', summaryX, doc.y);
        doc.fontSize(10).fillColor(colors.primary).text(formatCurrency(deliveryCharge), valueX, doc.y - 10, { align: 'left' });

        doc.fontSize(10).fillColor(colors.secondary).text('Item Discount:', summaryX, doc.y);
        doc.fontSize(10).fillColor(colors.primary).text(formatCurrency(itemDiscount), valueX, doc.y - 10, { align: 'left' });

        doc.fontSize(10).fillColor(colors.secondary).text('Coupon Discount:', summaryX, doc.y);
        doc.fontSize(10).fillColor(colors.primary).text(formatCurrency(couponDiscount), valueX, doc.y - 10, { align: 'left' });

        doc.moveDown(0.5);
        doc.rect(summaryX - 30, doc.y - 5, 200, 1).fill(colors.border);
        doc.moveDown(0.5);

        doc.fontSize(12).fillColor(colors.primary).text('TOTAL DUE:', summaryX, doc.y);
        doc.fontSize(10).fillColor(colors.accent).text(formatCurrency(finalAmount), valueX, doc.y - 9, { align: 'left' });

        doc.moveDown(3);

       
        const status = orders[0].orderStatus;
        const statusColor = status.toLowerCase() === 'delivered' ? colors.success :
                           status.toLowerCase() === 'pending' ? colors.highlight : colors.accent;

        doc.rect(50, doc.y, 500, 35).fill(statusColor);
        doc.fillColor('#FFFFFF').fontSize(14)
            .text(`Order Status: ${status.toUpperCase()}`, 0, doc.y + 12, { align: 'center' });
        doc.moveDown(3);

        
        doc.rect(0, doc.y, 612, 60).fill(colors.light);
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor(colors.primary)
            .text('Thank you for shopping with us!', { align: 'center' })
            .text('Please keep this invoice for your records.', { align: 'center' });

        
        doc.rect(40, 40, 520, doc.y).strokeColor(colors.border).lineWidth(1).stroke();

        doc.end();

    } catch (error) {
        console.error('Invoice download error:', error);
        res.status(500).json({
            message: 'Error generating invoice',
            error: error.message
        });
    }
};

const createRazorpayOrder = async (req, res) => {
    try {
        const {
            amount
        } = req.body
   

        if (!amount || isNaN(amount)) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount"
            })
        }

        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: `recipt_${Date.now()}`
        }
        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            key: process.env.RAZORPAY_KEY_ID
        })
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            message: "Server error"
        })

    }
}

const verifyRazorpayPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;
        const userId = req.session.user;
        const crypto = require('crypto');

        const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed',
                redirect: `/payment-failure?orderId=${orderId}&error=Invalid payment signature`
            });
        }

        const orders = await Order.find({
            orderMainId: orderId,
            userId
        });
        if (!orders || orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
                redirect: `/payment-failure?orderId=${orderId}&error=Order not found`
            });
        }

        // Process each order
        for (const order of orders) {
            // Check if we need to update stock (if payment status was pending before)
            const needsStockUpdate = order.paymentStatus !== 'Paid';
            
            if (needsStockUpdate) {
                // Update stock for each item in the order
                for (const item of order.items) {
                    const productInDb = await Product.findById(item.productId);
                    if (productInDb) {
                        const sizeIndex = productInDb.sizes.findIndex(s => s.size === item.size);
                        if (sizeIndex !== -1) {
                            // Reduce stock now that payment is confirmed
                            productInDb.sizes[sizeIndex].quantity -= item.quantity;
                            await productInDb.save();
                            console.log(`Stock updated for product ${item.productId}, size ${item.size}, new quantity: ${productInDb.sizes[sizeIndex].quantity}`);
                        }
                    }
                }
            }
            
            // Update order status
            order.orderStatus = 'Pending';
            order.paymentStatus = 'Paid';
            order.paymentMethod = 'razorpay';
            order.paymentId = razorpay_payment_id;
            order.razorpayOrderId = razorpay_order_id;
            await order.save();
            console.log(`Order ${order.orderId} updated to Paid status`);
        }

        res.json({
            success: true,
            message: 'Payment successful and order confirmed',
            orderId: orderId,
            redirect: `/payment-success?orderId=${orderId}`
        });
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification error: ' + error.message,
            redirect: `/payment-failure?orderId=${req.body.orderId}&error=${encodeURIComponent(error.message)}`
        });
    }
};

const retryPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user;
      
        // Find all orders associated with this orderMainId
        const orders = await Order.find({
            orderMainId: orderId,
            userId
        });
        
        if (!orders || orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        if (orders.some(order => order.paymentStatus === 'Paid')) {
            return res.status(400).json({
                success: false,
                message: 'Payment already completed'
            });
        }
        
        // Calculate total amount from all orders with the same orderMainId
        let subtotal = 0;
        orders.forEach(order => {
            subtotal += order.totalAmount;
        });
        
        // Apply shipping logic
        const shippingCost = 40;
        const totalAmount = subtotal + shippingCost;
        
        // Define the options object for Razorpay
        const options = {
            amount: totalAmount * 100, // Amount in smallest currency unit (paise for INR)
            currency: "INR",
            receipt: `retry_${orderId}_${Date.now()}`,
            payment_capture: 1 // Auto-capture payment
        };
     
        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: totalAmount * 100,
            key: process.env.RAZORPAY_KEY_ID,
            originalOrderId: orderId
        });
    } catch (error) {
        console.error('Error retrying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error initiating retry payment'
        });
    }
};

const paymentFailed = async (req, res) => {
    try {
        const userId = req.session.user;
        const orderId = req.query.orderId;
   
        if (!userId) {
            return res.redirect('/login');
        }

        if (!orderId) {
            return res.status(400).render('error', {
                user: null,
                message: 'No order ID provided',
                status: 400
            });
        }

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.redirect('/404-page');
        }

        const orders = await Order.find({
            orderMainId: orderId,
            userId
        }).lean();
        if (!orders || orders.length === 0) {
            return res.status(404).render('error', {
                user,
                message: 'Order not found',
                status: 404
            });
        }

        const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const orderDetails = {
            orderMainId: orderId,
            totalAmount: totalAmount.toFixed(2),
            paymentMethod: orders[0].paymentMethod,
            orderDate: orders[0].orderDate,
            paymentStatus: orders[0].paymentStatus,
            items: orders.flatMap(order => order.items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                size: item.size,
                price: item.price,
                finalPrice: item.finalPrice
            })))
        };

       
        const canRetry = orders[0].paymentStatus === 'Pending' && orders[0].paymentMethod === 'razorpay';

        res.render('paymentFailure', {
            user,
            order: orderDetails,
            errorMessage: req.query.error || 'Payment processing failed. Please try again.',
            canRetry
        });

    } catch (error) {
        console.error('Error in paymentFailed:', error);
        res.status(500).render('error', {
            user: req.session.user ? await User.findById(req.session.user).lean() : null,
            message: 'Server error while loading payment failure page',
            status: 500
        });
    }
};

const paymentSuccess = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        if (!orderId) {
            return res.status(400).render('error', {
                user: null,
                message: 'Invalid order ID',
                status: 400
            });
        }

        const user = await User.findById(userId).lean();
        const orders = await Order.find({
            orderMainId: orderId,
            userId
        }).lean();

        if (!orders || orders.length === 0) {
            return res.status(404).render('error', {
                user,
                message: 'Order not found',
                status: 404
            });
        }

       
        const isRazorpayPaid = orders.every(order =>
            order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid'
        );
        if (!isRazorpayPaid) {
            return res.redirect(`/order-details/${orderId}`); 
        }

        res.render('paymentSuccess', {
            user,
            orderId,
            paymentMethod: orders[0].paymentMethod,
            totalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0).toFixed(2),
            orderDate: orders[0].orderDate
        });
    } catch (error) {
        console.error('Error in paymentSuccess:', error);
        res.status(500).render('error', {
            user: req.session.user ? await User.findById(req.session.user).lean() : null,
            message: 'Server error while loading payment success page',
            status: 500
        });
    }
};

module.exports = {
    getCheckout,
    placeOrder,
    getOrderDetails,
    orderSuccess,
    getUserOrders,
    cancelOrder,
    submitReturnRequest,
    downloadPdf,
    createRazorpayOrder,
    verifyRazorpayPayment,
    retryPayment,
    paymentFailed,
    paymentSuccess
};