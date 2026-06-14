import {verifyAccessToken} from '../utils/jwt.js';

export default (req,res,next)=>{
    const authHeader = req.headers['authorization'||"Authorization"];
    if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: "Unauthorized" });
    }
}