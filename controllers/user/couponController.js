const Coupon = require('../../models/couponSchema');


const getCoupons = async (req, res) => {
    try {
      
        const currentDate = new Date();
        const coupons = await Coupon.find({
            isListed: true,
            expireOn: { $gte: currentDate }
        }).lean();
        
        res.status(200).json({ success: true, coupons });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({ success: false, message: 'Server error while fetching coupons' });
    }
};


const applyCoupon = async (req, res) => {
    try {
        const { code } = req.query;
        const currentDate = new Date();

        const coupon = await Coupon.findOne({
            name: code,
            isListed: true,
            expireOn: { $gte: currentDate }
        }).lean();

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found or expired' });
        }

        res.status(200).json({ success: true, coupon });
    } catch (error) {
        console.error("Error applying coupon:", error);
        res.status(500).json({ success: false, message: 'Server error while applying coupon' });
    }
};

module.exports = {
    getCoupons,
    applyCoupon,

};