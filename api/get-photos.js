const cloudinary = require('cloudinary').v2;

// Cloudinary yapılandırması
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    
    // Admin API ile basit resource listesi
    let allResources = [];
    
    try {
      // Image files
      const imageResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: `photo-uploader/${userId}`,
        max_results: 100,
        resource_type: 'image'
      });
      
      console.log('Image resources:', imageResult.resources?.length || 0);
      if (imageResult.resources) {
        allResources = [...allResources, ...imageResult.resources];
      }
    } catch (imageError) {
      console.log('Image fetch error:', imageError.message);
    }

    try {
      // Video files  
      const videoResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: `photo-uploader/${userId}`,
        max_results: 100,
        resource_type: 'video'
      });
      
      console.log('Video resources:', videoResult.resources?.length || 0);
      if (videoResult.resources) {
        allResources = [...allResources, ...videoResult.resources];
      }
    } catch (videoError) {
      console.log('Video fetch error:', videoError.message);
    }
    
    console.log('Toplam bulunan dosya sayısı:', allResources.length);

    // Dosyaları formatla
    const photos = allResources.map(resource => ({
      id: resource.public_id,
      url: resource.secure_url,
      originalName: resource.filename || resource.display_name || resource.public_id.split('/').pop(),
      size: resource.bytes || 0,
      type: resource.resource_type === 'video' ? 'video' : 'image',
      uploadDate: resource.created_at,
      format: resource.format
    }));

    // Manuel sıralama - en yeni önce
    photos.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.status(200).json({
      success: true,
      data: photos,
      count: photos.length,
      userId: userId
    });

  } catch (error) {
    console.error('Fotoğraf getirme hatası:', error);
    res.status(500).json({ 
      error: 'Fotoğraflar getirilirken hata oluştu',
      details: error.message 
    });
  }
}