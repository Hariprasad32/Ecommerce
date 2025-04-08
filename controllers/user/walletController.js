// walletController.js
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');


const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).redirect('/404-page');
        }

        res.render('wallet', {
            user: user,
            page: 'Wallet'
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

module.exports = {
    getWallet,
    refundToWallet
};