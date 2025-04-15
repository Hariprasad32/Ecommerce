const User = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const Cart = require('../../models/cartSchema')
const uploads = require('../../helpers/multer');
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const mongoose = require('mongoose')



async function securePassword (password){
    try {
        const hashPassword = await bcrypt.hash(password,10)
        return hashPassword

        
    } catch (error) {
        console.log("Password do not hashed")
        
    }
};

function generateOtp(){
    const digits = "1234567890"
    let otp = ""
    for(let i=0;i<6;i++){
        otp += digits[Math.floor(Math.random() * digits.length)];

    }
    return otp

};

const sendVerificationEmail = async(email,otp)=>{
    try {
        const transporter = nodemailer.createTransport({
            service : "gmail" ,
            port : 587 ,
            secure : false ,
            requireTLS : true ,
            auth : {
                user : process.env.NODEMAILER_EMAIL ,
                pass : process.env.NODEMAILER_PASSWORD ,

            }
        })

        const mailOptions = {
            from : process.env.NODEMAILER_EMAIL ,
            to : email ,
            subject : "Your OTP for reset password" ,
            text : `Your OTP is ${otp}` ,
            html : `<b><h4>Your OTP : ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions)
        console.log("Email sent :",info.messageId)
        return true
        
    } catch (error) {
        console.error("Error sending email",error)
        return false
        
    }
};

const getForgotPassword = async(req,res)=>{
    try {
        res.render("forgotPassword")
        
    } catch (error) {
        res.redirect('/pageNotFound')
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
    
        const findUser = await User.findOne({ email: email });

        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.otpGeneratedAt = Date.now();
                res.render("forgotPassOtp", { remainingTime: 60, email: email });
                console.log("OTP:", otp);
            } else {
                res.render('forgotPassword', { message: "Failed to send OTP. Please try again." });
            }
        } else {
            
            res.render('forgotPassword', { message: "User with this email does not exist." });
        }
    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
};

const verifyForgotPassOtp = async (req, res) => {
    try {
        const { otp, timer } = req.body;
        console.log('this is the timer: ', timer)

        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        if (otp === req.session.userOtp && timer > 0) {
            return res.json({ success: true, message:"Otp verified successfully"});
        } else {
            return res.status(400).json({ success: false, message: "The OTP you entered is incorrect. Please try again." });
        }
    } catch (error) {
        console.error("OTP Verification Error:", error);
        res.status(500).json({ success: false, message: "An error occurred. Please try again." });
    }
};

const getResetPassword = async(req,res)=>{
    try {

        res.render('resetPassword')
        
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
};

const resetPassword = async (req,res)=>{
    try {
        const {newPass1,newPass2} = req.body
        const email = req.session.email
        if(newPass1 === newPass2){
            const hashPassword = await securePassword(newPass1)
            console.log("hashpassword",hashPassword)
            await User.updateOne({email:email},{$set:{password:hashPassword}})

            res.redirect('/login')


        }else{
            res.render('/resetPaswword',{message:"Passwords do not match"})
        }

        
        
    } catch (error) {

        res.redirect('/pageNotFound')
        
    }

};

const resendOtp = async (req, res) => {
    try {
       

        const email = req.session.email;

        
       

        if (!email) {
            console.error("No email found in session");
            return res.status(400).json({ success: false, message: "No email found in session. Please restart the process." });
        }

        

        const otp = generateOtp();
        console.log("Generated OTP:", otp);

        req.session.userOtp = otp; 
        console.log("Updated session OTP:", req.session.userOtp);

        const emailSent = await sendVerificationEmail(email, otp);
        
        if (emailSent) {
            return res.status(200).json({ success: true, message: "OTP resent successfully" });
        } else {
            return res.status(400).json({ success: false, message: "Failed to resend OTP. Please try again." });
        }

    } catch (error) {
        console.error("Error resending OTP:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error. Please try again." });
    }
};

const sendEmailOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        
        console.log("Your verification OTP:", otp);

        if (emailSent) {
            req.session.emailOtp = otp;
            req.session.emailOtpEmail = email;
            req.session.otpGeneratedAt = Date.now();
            res.json({ success: true, message: "OTP sent successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to send OTP" });
        }
    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
};

const verifyEmailOtp = async (req,res)=>{
    try {
        const {email,otp} = req.body;
        if(!email||!otp){
            return res.status(400).json({success:false,message:"OTP and email are required"})
        }

        const otpAge = Date.now() - (req.session.otpGeneratedAt || 0);
        if (otpAge > 60 * 1000) { 
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }
        console.log("your otp",otp);
        console.log("your email",email);
        console.log("otp in session",req.session.otp)
        console.log("req.session.emailOtpEmail",req.session.emailOtpEmail)
        if(otp===req.session.emailOtp&&email=== req.session.emailOtpEmail){
            delete req.session.emailOtp;
            delete req.session.emailOtpEmail;
            delete req.session.otpGeneratedAt;
            res.json({success:true,message:'OTP verified successfully'})
        }else{
            res.status(400).json({success:false,message:"Invalid OTP or email"})
        }
    } catch (error) {
         console.log("error verfying OTP",error);
         res.status(500).json({success:false,message:'error validating email'})   
        
    }
}

const getProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressDoc = await Address.findOne({ userId });
        const addresses = addressDoc ? addressDoc.address : [];
        
        const defaultAddress = addresses.find(addr => addr.isDefault) || (addresses.length > 0 ? addresses[0] : null);
        console.log("default address",defaultAddress)   
        res.render('user-profile', { 
            user: userData, 
            addresses: addresses,
            defaultAddress: defaultAddress,
            page: 'profilePage' ,
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.redirect('/404-page');
    }
};

const updateProfile = async (req,res)=>{
    try {
       const userId = req.session.user;
       const userData = await User.findById(userId);

       res.render('userEdit-profile',{user:userData,page:"editProfilePage"})
   } catch (error) {
    res.redirect('/404-page')
   }
};

const editProfile = async (req,res)=>{
    try {
        const userId = req.session.user;
        const { name, email, phone } = req.body;

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email are required' });
        }

        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already in use' });
        }

        if (phone) {
            const existingPhone = await User.findOne({ phone, _id: { $ne: userId } });
            if (existingPhone) {
                return res.status(400).json({ success: false, message: 'Phone number already in use' });
            }
        }

        const updatedData = {
            name,
            email,
            phone: phone || null,
        };

        const user = await User.findByIdAndUpdate(userId, updatedData, { new: true });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: 'Profile updated successfully', user });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const myAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        
       
        const objectIdUserId = new mongoose.Types.ObjectId(userId);
        
        const user = await User.findById(objectIdUserId);
       
        
        const homePageNumber = parseInt(req.query.homePageNumber) || 1;
        const workPageNumber = parseInt(req.query.workPageNumber) || 1;
        const limit = 2;
        
        
        const userAddressDoc = await Address.findOne({ userId: objectIdUserId });
        
        if (!userAddressDoc || !userAddressDoc.address) {
          
            return res.render('add-address', {
                homeAddresses: [],
                workAddresses: [],
                homePagination: { totalPages: 0, currentPage: 1 },
                workPagination: { totalPages: 0, currentPage: 1 },
                user:user,
                page:'addressPage',
            });
        }

        
        const allHomeAddresses = userAddressDoc.address.filter(addr => addr.addressType === 'Home');
        const allWorkAddresses = userAddressDoc.address.filter(addr => addr.addressType === 'Work');
        
        
        const homeTotalPages = Math.ceil(allHomeAddresses.length / limit);
        const workTotalPages = Math.ceil(allWorkAddresses.length / limit);
        
        
        const homeStartIdx = (homePageNumber - 1) * limit;
        const workStartIdx = (workPageNumber - 1) * limit;
        
        const homeAddresses = allHomeAddresses.slice(homeStartIdx, homeStartIdx + limit);
        const workAddresses = allWorkAddresses.slice(workStartIdx, workStartIdx + limit);
        
        
        const homePagination = {
            totalPages: homeTotalPages,
            currentPage: homePageNumber,
            hasNextPage: homePageNumber < homeTotalPages,
            hasPrevPage: homePageNumber > 1
        };
        
        const workPagination = {
            totalPages: workTotalPages,
            currentPage: workPageNumber,
            hasNextPage: workPageNumber < workTotalPages,
            hasPrevPage: workPageNumber > 1
        };
        
        res.render('add-address', {
            homeAddresses: homeAddresses,
            workAddresses: workAddresses,
            homePagination: homePagination,
            workPagination: workPagination,
            user: user,
            page:'addressPage'
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).send('Server error');
    }
};

const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user || req.body.userId;
        const addressId = req.body.addressId;

        if (!userId || !addressId) {
            return res.status(400).json({ message: 'Missing userId or addressId' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ message: 'No addresses found' });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({ message: 'Address not found' });
        }

        addressDoc.address.splice(addressIndex, 1);
        await addressDoc.save();

        res.status(200).json({ message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ message: 'Failed to delete address', error: error.message });
    }
};

const editAddress = async (req, res) => {
    try {
        const userId = req.session.user || req.body.userId;
        const addressId = req.body.addressId;
        const { 
            addressType, 
            name, 
            addressLine1, 
            landMark, 
            city, 
            state, 
            pincode, 
            phone, 
            country, 
            isDefault 
        } = req.body;

        if (!userId || !addressId) {
            return res.status(400).json({ message: 'Missing userId or addressId' });
        }

        
        if (!addressType || !name || !addressLine1 || !city || !state || !pincode) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ message: 'No addresses found' });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

        
        address.addressType = addressType;
        address.name = name;
        address.addressLine1 = addressLine1;
        address.landMark = landMark || '';
        address.city = city;
        address.state = state;
        address.pincode = pincode;
        address.phone = phone || '';
        address.country = country || '';
        
        if (isDefault) {
            addressDoc.address.forEach(addr => addr.isDefault = false);
            address.isDefault = true;
        }

        await addressDoc.save();
        res.status(200).json({ message: 'Address updated successfully' });
    } catch (error) {
        console.error('Error editing address:', error);
        res.status(500).json({ message: 'Failed to edit address', error: error.message });
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user || req.body.userId;
        const addressId = req.body.addressId;

        if (!userId || !addressId) {
            return res.status(400).json({ message: 'Missing userId or addressId' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ message: 'No addresses found' });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

       
        addressDoc.address.forEach(addr => addr.isDefault = false);
        address.isDefault = true;

        await addressDoc.save();
        res.status(200).json({ message: 'Default address set successfully' });
    } catch (error) {
        console.error('Error setting default:', error);
        res.status(500).json({ message: 'Failed to set default address', error: error.message });
    }
};

const getAddress = async (req, res) => {
    try {
        const userId = req.session.user || req.body.userId;
        const addressId = req.params.id;

        if (!userId || !addressId) {
            return res.status(400).json({ message: 'Missing userId or addressId' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ message: 'No addresses found' });
        }

        const address = addressDoc.address.id(addressId);
        if (!address) {
            return res.status(404).json({ message: 'Address not found' });
        }

        res.status(200).json({ 
            address: {
                _id: address._id,
                addressType: address.addressType,
                name: address.name,
                addressLine1: address.addressLine1,
                landMark: address.landMark,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                phone: address.phone,
                country: address.country,
                isDefault: address.isDefault,
            }
        });
    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({ message: 'Failed to fetch address', error: error.message });
    }
};

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user || req.body.userId;
        const { 
            addressType, 
            name, 
            addressLine1,
            landMark, 
            city, 
            state, 
            pincode, 
            phone, 
            country, 
            isDefault 
        } = req.body;

        
        if (!userId) {
            return res.status(400).json({ message: 'Missing userId' });
        }

        if (!addressType || !name || !addressLine1 || !city || !state || !pincode) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        let addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            addressDoc = new Address({ userId, address: [] });
        }

       
        const isDuplicate = addressDoc.address.some(addr => {
            return (
                (addr.addressType?.toLowerCase() || '') === (addressType?.toLowerCase() || '') &&
                (addr.addressLine1?.toLowerCase() || '') === (addressLine1?.toLowerCase() || '') &&
                (addr.city?.toLowerCase() || '') === (city?.toLowerCase() || '') &&
                (addr.state?.toLowerCase() || '') === (state?.toLowerCase() || '') &&
                addr.pincode === pincode
            );
        });

        if (isDuplicate) {
            return res.status(400).json({ 
                message: 'An address with these details already exists',
                error: 'duplicate'
            });
        }

        const newAddress = { 
            addressType, 
            name, 
            addressLine1,
            landMark: landMark || "",
            city, 
            state, 
            pincode, 
            phone: phone || "", 
            country: country || "", 
            isDefault: isDefault || false 
        };

        if (isDefault) {
            addressDoc.address.forEach(addr => addr.isDefault = false);
        }

        addressDoc.address.push(newAddress);
        await addressDoc.save();

        res.status(200).json({ message: 'Address added successfully' });
    } catch (error) {
        console.error('Error in addAddress:', error.message);
        if (error.name === 'ValidationError') {
            const errors = Object.keys(error.errors).map(key => ({
                field: key,
                message: error.errors[key].message
            }));
            return res.status(400).json({ message: 'Validation failed', errors });
        }
        res.status(500).json({ message: 'Failed to add address', error: error.message });
    }
};

const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to upload an image' });
        }

        uploads.single('profileImage')(req, res, async (err) => {
            if (err) {
                console.error('Multer Error:', err);
                return res.status(400).json({ success: false, message: err.message || 'Failed to upload image' });
            }

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file provided' });
            }

            const imageUrl = `/uploads/productImage/${req.file.filename}`; 
            const user = await User.findByIdAndUpdate(
                userId,
                { profileImage: imageUrl },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.status(200).json({ success: true, message: 'Profile image updated successfully', imageUrl });
        });
    } catch (error) {
        console.error('Error uploading profile image:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
module.exports = {
    getForgotPassword ,
    forgotEmailValid ,
    verifyForgotPassOtp,
    getResetPassword,
    resendOtp,
    resetPassword,
    getProfile,
    updateProfile,
    myAddress,
    getAddress,
    addAddress,
    editAddress,
    deleteAddress,
    setDefaultAddress,
    editProfile,
    sendEmailOtp,
    verifyEmailOtp,
    uploadProfileImage
};

