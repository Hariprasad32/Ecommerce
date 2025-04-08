const User = require("../../models/userSchema");
const Categorie = require("../../models/categorySchema");
const Products = require("../../models/productSchema");
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const nodemailer = require("nodemailer");
const env = require('dotenv').config();
const bcrypt = require('bcrypt');

const loadHomePage = async (req, res) => {
    try {
        // console.log("Created session:", req.session.user);

        if (req.session.user) {            
           
            const userData = await User.findById(req.session.user);
           

            if (!userData) {
                console.log("User not found in DB");
                return res.render("home", { user: null });
            }

            console.log("User found:", userData.name);
            return res.render("home", { user: userData }); 
        } else {
            return res.render("home", { user: null }); 
        }
    } catch (error) {
        console.error("Home page error:", error);
        return res.status(500).send("Server error");
    }
};

const loadSignUp = async (req,res)=>{
    try {
        res.render('signup')
        
    } catch (error) {
        res.status(500).send("page not found")
        
    }
}

const securePassword = async (password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash;    

    } catch (error) {
        console.error("Error hashing password:", error);
        return null;
    }
}

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log("Received OTP:", otp);
        console.log("Session OTP:", req.session.userOtp);

        if (otp.trim() === req.session.userOtp) {
            console.log("OTP confirmed");

            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save();
            req.session.user = saveUserData._id;

            return res.json({ success: true, redirectUrl: "/" }); 
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ success: false, message: "An error occurred. Please try again." });
    }
};

function generateOtp(){
    return Math.floor(100000+Math.random()*900000).toString()
}

async function sendVerificationEmail(email,otp){
    try {
        
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS: true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

    const info = await transporter.sendMail({
    from:process.env.NODEMAILER_EMAIL,
    to:email,
    subject:"verify your account",
    text:`Your otp is ${otp}`,
    html:`<br>Your OTP:${otp}</br>`
    })

    return info.accepted.length >0

    } catch (error) {
        console.error("error sending email",error)
        return false
    }
}

const resendOtp = async (req,res)=>{

    try {
        const {email} = req.session.userData
        if(!email){
         return  res.status(400).json({success:false,message:"Email not found in session"})
        }

        const newOtp = generateOtp()
        req.session.userOtp = newOtp ;

        const emailSend = await sendVerificationEmail(email, newOtp);


        if(emailSend){
            console.log(`resendOtp:${newOtp }`)
            res.status(200).json({success:true,message:"OTP verified succesfully"})
        }else{
            res.status(500).json({success:false,message:"failed to send OTP"})
        }
        
    } catch (error) {

        console.error("Error resending OTP",error)
        res.status(500).json({success:false,message:"internal server error"})
    }

}

const signup = async (req,res)=>{
    try {
        const {name,email,phone,password,cpassword} = req.body

        if(password!==cpassword){
            return res.render("signup",{message:"password does not match"})
        }
        console.log("password checked")
        const findUser = await User.findOne({email});
        
        if(findUser){
            return res.render("signup",{message:"user Already exist"})
        }
        console.log("user checked")

       
        const otp = generateOtp()
        const emailSend = await sendVerificationEmail(email,otp)
        

        console.log("otp generated")
        if(!emailSend){
        return res.json("email-error")
        }
        if(!phone){
            return res.render("signup",{message : "phone number id required"})
        }

        req.session.userOtp = otp ;
        req.session.userData = {email,password,phone,name};


        res.render("verify-otp");
        console.log("Otp sent",otp) 


    } catch (error) {

    console.error("signup error")
    res.redirect("/pageNotFound")
        
    }
}

const pageNotFound = async (req,res)=>{
    try {
        return res.render("404-page")
    } catch (error) {
        res.redirect("pageNotFound")
        
    }
}

const loadLogin = async (req,res)=>{
    try {
        if(!req.session.user){
        return res.render("login")
        }

           return res.redirect('/')
        
        
    } catch (error) {
        console.log("login page not found")
       return res.redirect('/404-page')

    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const findUser = await User.findOne({ isAdmin: 0, email: email });

        if (!findUser) {
            return res.render("login", { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render("login", { message: "User has been blocked" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);

        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect Password" });
        }

        req.session.user = findUser._id;

        return res.redirect('/');   

    } catch (error) {
        console.log("Login error:", error);
        return res.render("login", { message: "Login Failed" });
    }
};

const logout = async (req,res)=>{

    try {
          req.session.user = undefined
          req.session.userData = undefined
            return res.redirect('/login')
       
    } catch (error) {
        console.log("LOgout error",error)

        return res.redirect('/404-page')
    }

}

const loadShopPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const categories = await Categorie.find({ isListed: true });
        const page = parseInt(req.params.page) || 1;
        let wishlistProductIds = [];
        
        
        if (user) {
            const wishlistDoc = await Wishlist.findOne({ user }).populate("products.productId");
            if (wishlistDoc && wishlistDoc.products.length > 0) {
                wishlistProductIds = wishlistDoc.products.map(item => item.productId._id.toString());
            }
        }

        const categoriesWithIds = categories.map(category => ({ 
            id: category._id, 
            name: category.name,
            selected: false 
        }));
        
        res.render('shop-page', {
            user: userData,
            category: categoriesWithIds,
            products: [],
            page: page, 
            searchQuery:'',
            sortPrice: '',
            wishlistProductIds: wishlistProductIds 
        });
        
    } catch (error) {
        console.error("Error loading shop page:", error);
        res.redirect("/404-page");
    }
};

const getProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Categorie.find({ isListed: true });
        const categoryIds = categories.map(category => category._id.toString());
        console.log('userId',user)
        
        
        const page = parseInt(req.body.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;
        
        const selectedCategories = req.body.categories && req.body.categories.length > 0 
            ? req.body.categories 
            : categoryIds;
        
        const minPrice = req.body.minPrice ? parseInt(req.body.minPrice) : 0;
        const maxPrice = req.body.maxPrice ? parseInt(req.body.maxPrice) : Number.MAX_SAFE_INTEGER ;
        const sortPrice = req.body.sortPrice || '';
        const searchQuery = req.body.searchQuery ? req.body.searchQuery.trim() : '';
        
        const query = {
            isBlocked: false,
            category: { $in: selectedCategories },
            "sizes.quantity": { $gt: 0 },
            salePrice: { $gte: minPrice, $lte: maxPrice }
        };
        
        if (searchQuery) {
            query.$or = [
                { productName: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } }
            ];
        }
       
        let sort = {};
        if (sortPrice === 'lowToHigh') {
            sort.salePrice = 1;
        } else if (sortPrice === 'highToLow') {
            sort.salePrice = -1;
        } else if (sortPrice === 'aToZ') {
            sort.productName = 1;
        } else if (sortPrice === 'zToA') {
            sort.productName = -1; 
        } else {
            sort.createdOn = -1;
        }
        const products = await Products.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit);
            // console.log(products,"products")
            
        const totalProducts = await Products.countDocuments(query);
        console.log("totalProducts",totalProducts)
        const totalPages = Math.ceil(totalProducts / limit);
        let wishlistProductIds = [];

        if (user) {
            const wishlistDoc = await Wishlist.findOne({ userId:user }).populate("products.productId");
            console.log(wishlistDoc,"wishlist doc")
            if (wishlistDoc && wishlistDoc.products.length > 0) {
                wishlistProductIds = wishlistDoc.products.map(item => item.productId._id.toString());
            }
            console.log("this is th ewishlist products",wishlistProductIds)
        }
        
        res.json({
            success: true,
            products: products,
            pagination: {
                page: page,
                totalPages: totalPages,
                totalProducts: totalProducts
            },
            wishlistProductIds: wishlistProductIds 
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch products",
            error: error.message
        });
    }
};

module.exports = {
    loadHomePage,
    pageNotFound,
    loadSignUp,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadShopPage,
    getProducts
}