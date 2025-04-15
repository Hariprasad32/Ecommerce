const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');

const getWallet = async (req, res) => {
    try {
        const itemsPerPage = 5;
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search?.trim() || '';

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { 'walletTransactions.type': { $regex: search, $options: 'i' } }
                ]
            };
        }

       
        const users = await User.find(query).lean();
        

        
        let transactions = users
            .filter(user => user.walletTransactions && user.walletTransactions.length > 0)
            .flatMap(user => 
                user.walletTransactions.map(transaction => ({
                    id: transaction._id.toString(),
                    date: transaction.date,
                    user: user.name,
                    type: transaction.type,
                    amount: transaction.amount,
                    userDetails: {
                        name: user.name,
                        email: user.email,
                        userId: user._id.toString()
                    },
                    source: transaction.description ? { type: transaction.description } : null
                }))
            )
            .sort((a, b) => b.date - a.date);

        
        if (search) {
            transactions = transactions.filter(transaction =>
                transaction.id.toLowerCase().includes(search.toLowerCase()) ||
                transaction.user.toLowerCase().includes(search.toLowerCase()) ||
                transaction.type.toLowerCase().includes(search.toLowerCase())
            );
        }

        
        const totalTransactions = transactions.length;
        const totalPages = Math.ceil(totalTransactions / itemsPerPage);
        const start = (page - 1) * itemsPerPage;
        const paginatedTransactions = transactions.slice(start, start + itemsPerPage);

        
        if (page < 1 || (totalPages > 0 && page > totalPages)) {
            return res.redirect('/admin/wallet?page=1' + (search ? `&search=${encodeURIComponent(search)}` : ''));
        }

        
        res.render('wallet-list', {
            page: "Wallet",
            transactions: paginatedTransactions,
            totalPages: totalPages,
            currentPage: page,
            search: search
        });
        
    } catch (error) {
        console.error('Error fetching wallet transactions:', error);
        res.status(500).send('Server Error');
    }
};

const getWalletDetails = async (req, res) => {
    try {
        const transactionId = req.params.id || req.query.id; 

       
        const user = await User.findOne(
            { 'walletTransactions._id': transactionId },
            {
                name: 1,
                email: 1,
                wallet: 1,
                walletTransactions: { $elemMatch: { _id: transactionId } }
            }
        );

        if (!user || !user.walletTransactions.length) {
            return res.status(404).render('wallet-details', {
                error: 'Transaction not found',
                transaction: null
            });
        }

        const transaction = user.walletTransactions[0];

     
        let orderId = null;
        if (transaction.description) {
            
            const orderMatch = transaction.description.match(/Order\s+(?:#|\()?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            if (orderMatch) {
                orderId = orderMatch[1];
                
                const order = await Order.findOne({ orderId });
                if (!order) {
                    orderId = null; 
                }
            }
        }

       
        const transactionData = {
            id: transaction._id.toString(),
            amount: transaction.amount,
            type: transaction.type,
            description: transaction.description || 'No description provided',
            date: transaction.date,
            orderId: orderId,
            userDetails: {
                name: user.name,
                email: user.email,
                userId: user._id.toString()
            }
        };

        res.render('wallet-details', {
            transaction: transactionData,
            error: null
        });
    } catch (error) {
        console.error('Error fetching wallet details:', error);
        res.status(500).render('wallet-details', {
            error: 'An error occurred while fetching transaction details',
            transaction: null
        });
    }
};

module.exports = {
    getWallet,
    getWalletDetails
};