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
        const userData = await User.findById(userId);

        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';


        let query = {
            userId
        };


        if (search) {

            const searchRegex = new RegExp(search, 'i');
            query.orderMainId = searchRegex;
        }


        const allOrders = await Order.find(query)
            .sort({
                orderDate: -1
            })
            .lean();

        if (!allOrders || allOrders.length === 0) {
            return res.render('orders', {
                orders: [],
                user: userData,
                page: 'ordersPage',
                search,
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalOrders: 0,
                    limit
                }
            });
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
                    itemCount: 0,
                    items: []
                };
            }
            groupedOrders[mainId].totalAmount += order.totalAmount;
            groupedOrders[mainId].itemCount += order.items.length;
            groupedOrders[mainId].items.push(...order.items);
        });

        const allGroupedOrders = Object.values(groupedOrders);
        const totalOrders = allGroupedOrders.length;
        const totalPages = Math.ceil(totalOrders / limit);
        const paginatedOrders = allGroupedOrders.slice(skip, skip + limit);

        res.render('orders', {
            orders: paginatedOrders,
            user: userData,
            page: 'ordersPage',
            search,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalOrders: totalOrders,
                limit: limit
            }
        });

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


        const cartData = await Cart.findOne({
                userId: userId
            })
            .populate({
                path: 'items.productId',
                select: 'productName productImage regularPrice salePrice productOffer sizes'
            })
            .lean();


        const cartItems = cartData ? cartData.items.map(item => {
            return {
                ...item,

                sizes: item.sizes.map(size => ({
                    size: size.size,
                    quantity: size.quantity,
                    price: item.productId.salePrice || item.productId.regularPrice,
                    totalPrice: (item.productId.salePrice || item.productId.regularPrice) * size.quantity
                }))
            };
        }) : [];


        const checkoutItems = [];
        cartItems.forEach(item => {
            item.sizes.forEach(size => {
                checkoutItems.push({
                    productId: item.productId._id,
                    productName: item.productId.productName,
                    productImage: item.productId.productImage[0] || '',
                    size: size.size,
                    quantity: size.quantity,
                    price: size.price,
                    totalPrice: size.totalPrice,
                    productOffer: item.productId.productOffer || 0
                });
            });
        });

        const addressData = await Address.findOne({
            userId: userId
        }).lean();
        const addresses = addressData ? addressData.address : [];


        const subtotal = checkoutItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        console.log("subtotal", subtotal)
        const discount = checkoutItems.reduce((sum, item) => {
            if (item.productOffer > 0) {
                return sum + (item.totalPrice * item.productOffer / 100);
            }
            return sum;
        }, 0);

        console.log("discount", discount)

        const taxRate = 0;
        const shippingCost = 0;
        const tax = (subtotal - discount) * taxRate;
        const total = subtotal + tax + shippingCost;

        console.log("total", total)

        res.render('checkout', {
            user: userData,
            addresses: addresses,
            cartItems: checkoutItems,
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
        const {
            addressId,
            paymentMethod,
            couponCode,
            amount,
            couponDiscount
        } = req.body;
        const userId = req.session.user;



        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }

        const cart = await Cart.findOne({
            userId
        }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        const addressDoc = await Address.findOne({
            "address._id": addressId
        });
        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shipping address'
            });
        }

        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Address not found in document'
            });
        }

        // Verify stock availability
        for (const item of cart.items) {
            const product = item.productId;
            for (const size of item.sizes) {
                const productInDb = await Product.findById(product._id);
                const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);
                if (sizeIndex === -1 || productInDb.sizes[sizeIndex].quantity < size.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${product.productName} in size ${size.size}`
                    });
                }
            }
        }

        let appliedCoupon = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({
                name: couponCode,
                isListed: true,
                expireOn: {
                    $gte: new Date()
                }
            });

            if (!coupon) {
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
                return res.status(400).json({
                    success: false,
                    message: `Coupon requires a minimum order of ₹${coupon.minimumPrice}`
                });
            }
            appliedCoupon = coupon;

            if (couponDiscount !== coupon.offerPrice) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon discount mismatch'
                });
            }
        }


        const orderDate = new Date();
        const ordersMainId = uuidv4().substring(0, 8).toUpperCase();
        let totalOrderAmount = 0;

        const orderDetails = cart.items.flatMap(item => {
            const product = item.productId;
            return item.sizes.map(size => {
                const productPrice = product.salePrice || product.regularPrice;
                // const discountPercentage = product.productOffer || 0;
                // const discountAmount = (productPrice * discountPercentage) / 100;
                const finalPrice = productPrice;
                const totalAmount = finalPrice * size.quantity;
                totalOrderAmount +=amount;
                return {
                    product,
                    size,
                    productPrice,
                    finalPrice,
                    totalAmount
                };
            });
        });

       
        let remainingCouponDiscount = couponDiscount || 0;
        const orders = [];
        for (const item of cart.items) {
            const product = item.productId;
            for (const size of item.sizes) {
                const productPrice = product.salePrice || product.regularPrice;

                let finalPrice = productPrice;
                let totalAmount = finalPrice * size.quantity;

                
                if (remainingCouponDiscount > 0) {
                    const itemProportion = totalAmount / totalOrderAmount;
                    const itemCouponDiscount = Math.min(remainingCouponDiscount, itemProportion * couponDiscount);
                    totalAmount -= itemCouponDiscount;
                    remainingCouponDiscount -= itemCouponDiscount;
                    finalPrice = totalAmount / size.quantity; 
                }

                const productInDb = await Product.findById(product._id);
                const sizeIndex = productInDb.sizes.findIndex(s => s.size === size.size);

                const newOrder = new Order({
                    orderId: `${uuidv4()}`,
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
                        couponDiscount: appliedCoupon ? (couponDiscount * (totalAmount / totalOrderAmount)) : 0 
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
                    paymentMethod,
                    totalAmount,
                    orderDate,
                    orderStatus: 'Pending',
                    paymentStatus: 'Pending',
                    couponCode: couponCode || null
                });

                await newOrder.save();

                orders.push(newOrder);

                productInDb.sizes[sizeIndex].quantity -= size.quantity;
                await productInDb.save();
            }

        }



        cart.items = [];
        await cart.save();

        const calculatedTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        if (Math.abs(calculatedTotal - amount) > 0.01) {
            return res.status(400).json({
                success: false,
                message: 'Total amount mismatch'
            });
        }


        if (paymentMethod === 'razorpay') {
           
            return res.status(200).json({
                success: true,
                message: 'Proceed to payment',
                orderId: ordersMainId,
                amount: totalOrderAmount,
                orderDetails: {
                    addressId,
                    couponCode,
                    orderDate
                }
            });
        }

        // For COD, proceed directly to success
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: ordersMainId
        });
    } catch (error) {
        console.error('Error placing order:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while placing your order'
        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user;

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }

        const orders = await Order.find({
                orderMainId: orderId,
                userId
            })
            .sort({
                orderDate: 1
            })
            .lean();

        if (!orders || orders.length === 0) {
            return res.status(404).render('404-page', {
                user: null,
                message: 'Order not found',
                status: 404
            });
        }

        const allOrderItems = [];
        const productIds = new Set();

        orders.forEach(order => {
            order.items.forEach(item => {
                allOrderItems.push({
                    orderId: order.orderId,
                    productId: {
                        _id: item.productId,
                        productName: item.productName,
                        productImage: item.productImage || '/images/default-product.jpg'
                    },
                    price: item.price,
                    finalPrice: item.finalPrice || item.price,
                    quantity: item.quantity,
                    size: item.size,
                    status: item.status,

                    couponDiscount: item.couponDiscount || 0,
                    itemId: item._id
                });
                productIds.add(item.productId.toString());
            });
        });

        const recommendedProducts = await Product.aggregate([{
                $match: {
                    _id: {
                        $nin: Array.from(productIds)
                    },
                    isListed: true
                }
            },
            {
                $sample: {
                    size: 4
                }
            },
            {
                $project: {
                    productName: 1,
                    productImage: {
                        $arrayElemAt: ["$productImage", 0]
                    },
                    salePrice: 1,
                    regularPrice: 1,
                    category: 1
                }
            }
        ]);

        const primaryOrder = orders[0];

        // Check if request expects JSON (e.g., from fetch)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({
                orders: {
                    orderId: primaryOrder.orderId,
                    orderMainId: primaryOrder.orderMainId,
                    status: primaryOrder.orderStatus,
                    paymentMethod: primaryOrder.paymentMethod,
                    orderDate: primaryOrder.orderDate,
                    finalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
                    orderItems: allOrderItems,
                    paymentStatus: primaryOrder.paymentStatus,

                },
                address: primaryOrder.shippingAddress,
                user: user,
                recommendedProducts: recommendedProducts || []
            });


        }

        res.render("order-details", {
            orders: {
                orderId: primaryOrder.orderId,
                orderid: primaryOrder.orderMainId,
                status: primaryOrder.orderStatus,
                paymentMethod: primaryOrder.paymentMethod,
                orderDate: primaryOrder.orderDate,
                finalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
                orderitems: allOrderItems,
                paymentStatus: primaryOrder.paymentStatus,
                couponCode: primaryOrder.couponCode,
            },
            address: primaryOrder.shippingAddress,
            user: user,
            recommendedProducts: recommendedProducts || []
        });

    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).render('404-page', {
            user: req.session.user ? await User.findById(req.session.user).lean() : null,
            message: 'Server error while loading order details',
            status: 500
        });
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
        const {
            orderId,
            productId,
            orderMainId
        } = req.body;


        if (!orderId || !productId || !orderMainId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required IDs'
            });
        }


        const order = await Order.findOne({
            orderId
        });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }




        const itemToCancel = order.items.find(item =>
            item.productId.toString() === productId && ['Pending', 'Processing', 'Confirmed'].includes(item.status)
        );

        if (!itemToCancel) {
            return res.status(400).json({
                success: false,
                message: 'Item not found or not eligible for cancellation. ' +
                    `Current status: ${order.items.find(i => i.productId.toString() === productId)?.status || 'unknown'}`
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
                message: "User mot found"
            })
        }

        await User.findByIdAndUpdate(order.userId, {

            $inc: {
                wallet: refundAmount
            },
            $push: {
                walletTransactions: {
                    amount: refundAmount,
                    type: "credit",
                    description: `Refund for cancelled order ${itemToCancel.productName} (Order:${order.orderId})`
                }
            }
        })


        order.totalAmount = order.items.reduce(
            (total, item) => total + (item.status !== 'Cancelled' ? item.finalPrice * item.quantity : 0),
            0
        );

        await order.save();


        const relatedOrders = await Order.find({
            orderMainId
        });
        const statusUpdate = calculateOrderStatus(relatedOrders);

        if (statusUpdate.needsUpdate) {
            await Order.updateMany({
                orderMainId
            }, {
                $set: {
                    orderStatus: statusUpdate.newStatus
                }
            });
        }

        res.json({
            success: true,
            message: 'Item cancelled successfully',
            newStatus: statusUpdate.newStatus
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
    let allCancelled = true;
    let anyActive = false;

    orders.forEach(order => {
        const activeItems = order.items.filter(item => ['Pending', 'Processing', 'Confirmed', 'Shipped'].includes(item.status));

        if (activeItems.length > 0) {
            allCancelled = false;
            if (activeItems.length < order.items.length) {
                anyActive = true;
            } else {
                anyActive = true;
            }
        }
    });

    const newStatus = allCancelled ? 'Cancelled' :
        anyActive ? 'Partially Cancelled' :
        'Processing';

    return {
        newStatus,
        needsUpdate: orders.some(o => o.orderStatus !== newStatus)
    };
};

const submitReturnRequest = async (req, res) => {
    try {
        const {
            orderId,
            productId,
            reason,
            comments
        } = req.body;
        const userId = req.session.user;

        const order = await Order.findOne({
            orderId,
            userId
        });

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
        order.returnDetails = {
            reason,
            comments,
            requestDate: new Date()
        };

        await updatePaymentStatus(order);
        console.log("item.status", item.status)
        await order.save();
        console.log('order after saved', order)

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

        const orders = await Order.find({
                orderMainId: req.params.orderId
            })
            .populate({
                path: 'items.productId',
                select: 'productName productImage'
            })
            .populate('userId', 'name email');

        if (!orders || orders.length === 0) {
            return res.status(404).json({
                message: 'No orders found for this orderMainId'
            });
        }


        const doc = new PDFDocument({
            margin: 50
        });


        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice_${req.params.orderMainId}.pdf`);


        doc.pipe(res);


        doc.fontSize(20).font('Helvetica-Bold').text('Invoice', {
            align: 'center'
        });
        doc.fontSize(10).font('Helvetica')
            .text(`Order Main ID: ${req.params.orderMainId}`, {
                align: 'center'
            })
            .text(`Date: ${new Date(orders[0].orderDate).toLocaleDateString()}`, {
                align: 'center'
            });

        doc.moveDown(2);


        doc.font('Helvetica-Bold').text('Customer Details:', {
            underline: true
        });
        doc.font('Helvetica')
            .text(`Name: ${orders[0].userId.name}`)
            .text(`Email: ${orders[0].userId.email}`);

        doc.moveDown();


        doc.font('Helvetica-Bold').text('Billing Address:', {
            underline: true
        });
        const address = orders[0].shippingAddress;
        doc.font('Helvetica')
            .text(`${address.name}`)
            .text(address.phone ? `Phone: ${address.phone}` : '')
            .text(`${address.city}, ${address.state} ${address.pincode}`);

        doc.moveDown();


        doc.font('Helvetica-Bold').text('Payment Method:', {
            underline: true
        });
        doc.font('Helvetica').text(orders[0].paymentMethod === 'cod' ? 'Cash on Delivery' : orders[0].paymentMethod);

        doc.moveDown(2);


        const invoiceTableTop = doc.y;
        doc.font('Helvetica-Bold')
            .text('Order ID', 50, invoiceTableTop)
            .text('Product', 150, invoiceTableTop)
            .text('Size', 300, invoiceTableTop)
            .text('Quantity', 350, invoiceTableTop)
            .text('Price', 400, invoiceTableTop)
            .text('Total', 500, invoiceTableTop);

        doc.moveDown();
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();


        let currentY = doc.y;
        doc.font('Helvetica');
        orders.forEach((order) => {
            order.items.forEach((item) => {
                doc.text(order.orderId, 50, currentY);
                doc.text(item.productId.productName, 150, currentY);
                doc.text(item.size, 300, currentY);
                doc.text(item.quantity.toString(), 350, currentY);
                doc.text(`₹${item.price.toLocaleString()}`, 400, currentY);
                doc.text(`₹${(item.price * item.quantity).toLocaleString()}`, 500, currentY);
                currentY += 30;
            });
        });

        doc.moveDown(2);


        const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        doc.font('Helvetica-Bold').fontSize(12).text('Total Amount:', 400);
        doc.text(`₹${totalAmount.toLocaleString()}`, 500);


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
        console.log("req reqched here", amount)

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
        console.log("this is the order placed by the razor pay", order)
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

        for (const order of orders) {
            order.orderStatus = 'Pending';
            order.paymentStatus = 'Paid';
            order.paymentMethod = 'razorpay';
            order.paymentId = razorpay_payment_id;
            order.razorpayOrderId = razorpay_order_id;
            await order.save();
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
        const {
            orderId
        } = req.body;
        const userId = req.session.user;
        console.log("orderId", orderId)
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
        const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const options = {
            amount: Math.round(totalAmount * 100),
            currency: 'INR',
            receipt: `receipt_${Date.now()}`
        };

        const razorpayOrder = await razorpay.orders.create(options);
        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
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
        console.log("req reachd here")
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

        // Check if retry is applicable
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

        // Verify this is a Razorpay payment and paid
        const isRazorpayPaid = orders.every(order =>
            order.paymentMethod === 'razorpay' && order.paymentStatus === 'Paid'
        );
        if (!isRazorpayPaid) {
            return res.redirect(`/order-details/${orderId}`); // Redirect if not Razorpay or not paid
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