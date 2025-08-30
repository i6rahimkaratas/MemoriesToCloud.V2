const AWS = require('aws-sdk');
const cloudinary = require('cloudinary').v2;

// AWS S3 yapılandırması
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Cloudinary yapılandırması (mevcut fotoğraflar için)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Sadece GET metodu destekleniyor' });
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID gerekli' });
    }

    console.log('Fotoğraflar getiriliyor, User ID:', userId);
    
    let allPhotos = [];

    // 1. AWS S3'ten fotoğrafları getir
    try {
      console.log('AWS S3\'ten fotoğraflar getiriliyor...');
      
      const s3Params = {
        Bucket: BUCKET_NAME,
        Prefix: `memories-to-cloud/${userId}/`,
        MaxKeys: 1000
      };

      const s3Result = await s3.listObjectsV2(s3Params).promise();
      
      if (s3Result.Contents && s3Result.Contents.length > 0) {
        console.log('S3\'te bulunan dosya sayısı:', s3Result.Contents.length);
        
        // S3 objelerini standart formata çevir
        const s3Photos = s3Result.Contents.map(obj => {
          // Metadata'yı almak için ayrı çağrı yapmak yerine dosya adından bilgi çıkar
          const fileName = obj.Key.split('/').pop();
          const fileExtension = fileName.split('.').pop().toLowerCase();
          
          // Dosya tipini uzantıdan tahmin et
          const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
          const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
          
          let fileType = 'unknown';
          if (imageExts.includes(fileExtension)) {
            fileType = 'image';
          } else if (videoExts.includes(fileExtension)) {
            fileType = 'video';
          }

          return {
            id: obj.Key,
            url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${obj.Key}`,
            originalName: fileName,
            size: obj.Size || 0,
            type: fileType,
            uploadDate: obj.LastModified,
            format: fileExtension,
            storage: 'aws-s3'
          };
        });
        
        allPhotos = [...allPhotos, ...s3Photos];
      } else {
        console.log('S3\'te dosya bulunamadı');
      }
      
    } catch (s3Error) {
      console.error('S3 fetch error:', s3Error.message);
      // S3 hatası olursa devam et, sadece log'la
    }

    // 2. Cloudinary'den mevcut fotoğrafları getir (backward compatibility)
    try {
      console.log('Cloudinary\'den mevcut fotoğraflar getiriliyor...');
      
      // Image files
      const imageResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: `photo-uploader/${userId}`,
        max_results: 100,
        resource_type: 'image'
      });
      
      if (imageResult.resources && imageResult.resources.length > 0) {
        console.log('Cloudinary image resources:', imageResult.resources.length);
        const cloudinaryImages = imageResult.resources.map(resource => ({
          id: resource.public_id,
          url: resource.secure_url,
          originalName: resource.filename || resource.display_name || resource.public_id.split('/').pop(),
          size: resource.bytes || 0,
          type: 'image',
          uploadDate: resource.created_at,
          format: resource.format,
          storage: 'cloudinary'
        }));
        allPhotos = [...allPhotos, ...cloudinaryImages];
      }

      // Video files
      const videoResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: `photo-uploader/${userId}`,
        max_results: 100,
        resource_type: 'video'
      });
      
      if (videoResult.resources && videoResult.resources.length > 0) {
        console.log('Cloudinary video resources:', videoResult.resources.length);
        const cloudinaryVideos = videoResult.resources.map(resource => ({
          id: resource.public_id,
          url: resource.secure_url,
          originalName: resource.filename || resource.display_name || resource.public_id.split('/').pop(),
          size: resource.bytes || 0,
          type: 'video',
          uploadDate: resource.created_at,
          format: resource.format,
          storage: 'cloudinary'
        }));
        allPhotos = [...allPhotos, ...cloudinaryVideos];
      }
      
    } catch (cloudinaryError) {
      console.error('Cloudinary fetch error:', cloudinaryError.message);
      // Cloudinary hatası olursa devam et, sadece log'la
    }
    
    console.log('Toplam bulunan dosya sayısı:', allPhotos.length);

    // Tarihe göre sırala - en yeni önce
    allPhotos.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.status(200).json({
      success: true,
      data: allPhotos,
      count: allPhotos.length,
      userId: userId,
      sources: {
        s3: allPhotos.filter(p => p.storage === 'aws-s3').length,
        cloudinary: allPhotos.filter(p => p.storage === 'cloudinary').length
      }
    });

  } catch (error) {
    console.error('Fotoğraf getirme hatası:', error);
    res.status(500).json({ 
      error: 'Fotoğraflar getirilirken hata oluştu',
      details: error.message 
    });
  }
}