
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');


const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        const {page = 1} = req.query;
        const limit = 5
        const skip = (page-1)*limit;

        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).redirect('/404-page');
        }
        
        const transactions = user.walletTransactions || [];
        const sortedTransactions = transactions.sort((a,b)=>b.date-a.date);
        const totalTransactions = transactions.length;
        const totalPages = Math.ceil(totalTransactions/limit);


        const paginatedTransactions = sortedTransactions.slice(skip,skip+limit);

        const currentPage = Math.max(1,Math.min(parseInt(page),totalPages))


        res.render('wallet', {
            user: user,
            transactions: paginatedTransactions,
            page: 'Wallet',
            currentPage: currentPage,
            totalPages: totalPages,
            totalTransactions: totalTransactions
        });
    } catch (error) {
        console.log('Error loading wallet:', error);
        res.redirect('/404-page');
    }
};

const refundToWallet = async (req, res) => {
    const { orderId, itemId } = req.body;
    const userId = req.session.user;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).render('wallet', {
                user: await User.findById(userId),
                page: 'Wallet',
                error: 'Order not found'
            });
        }

        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).render('wallet', {
                user: await User.findById(userId),
                page: 'Wallet',
                error: 'Unauthorized'
            });
        }

       
        if (order.paymentMethod === 'Cash on Delivery' && order.paymentStatus === 'Pending') {
            return res.status(400).render('wallet', {
                user: await User.findById(userId),
                page: 'Wallet',
                error: 'Refunds are not allowed for Cash on Delivery orders with pending payment'
            });
        }

        let refundAmount = 0;
        let refundDescription = '';

        if (itemId) {
            const item = order.items.find(i => i._id.toString() === itemId);
            if (!item) {
                return res.status(404).render('wallet', {
                    user: await User.findById(userId),
                    page: 'Wallet',
                    error: 'Item not found in order'
                });
            }

            if (!["Cancelled", "Returned"].includes(item.status)) {
                return res.status(400).render('wallet', {
                    user: await User.findById(userId),
                    page: 'Wallet',
                    error: 'Item must be canceled or returned to process a refund'
                });
            }

            if (item.refunded) {
                return res.status(400).render('wallet', {
                    user: await User.findById(userId),
                    page: 'Wallet',
                    error: 'Refund already processed for this item'
                });
            }

            refundAmount = item.finalPrice * item.quantity;
            refundDescription = `Refund for item ${item.productName} (Order ${order.orderId})`;

            item.refunded = true;
            await order.save();
        } else {
            if (!["Cancelled", "Returned", "Partially Cancelled"].includes(order.orderStatus)) {
                return res.status(400).render('wallet', {
                    user: await User.findById(userId),
                    page: 'Wallet',
                    error: 'Order must be canceled or returned to process a refund'
                });
            }

            const refundableItems = order.items.filter(item =>
                ["Cancelled", "Returned"].includes(item.status) && !item.refunded
            );

            if (refundableItems.length === 0) {
                return res.status(400).render('wallet', {
                    user: await User.findById(userId),
                    page: 'Wallet',
                    error: 'No refundable items in this order'
                });
            }

            refundAmount = refundableItems.reduce((sum, item) =>
                sum + (item.finalPrice * item.quantity), 0
            );
            refundDescription = `Refund for order ${order.orderId}`;

            refundableItems.forEach(item => item.refunded = true);
            await order.save();
        }

        const updateData = { $inc: { wallet: refundAmount } };
        if (User.schema.paths.walletTransactions) {
            updateData.$push = {
                walletTransactions: {
                    amount: refundAmount,
                    type: 'credit',
                    description: refundDescription
                }
            };
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).redirect('/404-page');
        }

        res.render('wallet', {
            user: updatedUser,
            page: 'Wallet',
            success: `Refund of $${refundAmount.toFixed(2)} added to wallet`
        });
    } catch (error) {
        console.log('Error processing refund:', error);
        res.redirect('/404-page');
    }
};
const checkWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const user = await User.findById(userId).select('wallet');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, balance: user.wallet || 0 });
    } catch (error) {
        console.error('Error checking wallet balance:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

module.exports = {
    getWallet,
    refundToWallet,
    checkWalletBalance
};