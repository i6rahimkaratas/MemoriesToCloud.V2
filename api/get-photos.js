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
    
    // Cloudinary'den belirli kullanıcının fotoğraflarını getir
    const result = await cloudinary.search
      .expression(`folder:photo-uploader/${userId}`)
      .sort_by([['created_at', 'desc']])
      .max_results(100)
      .execute();

    console.log('Bulunan dosya sayısı:', result.resources.length);

    // Dosyaları formatla
    const photos = result.resources.map(resource => ({
      id: resource.public_id,
      url: resource.secure_url,
      originalName: resource.filename,
      size: resource.bytes,
      type: resource.resource_type === 'video' ? 'video' : 'image',
      uploadDate: resource.created_at,
      format: resource.format
    }));

    res.status(200).json({
      success: true,
      data: photos,
      count: photos.length
    });

  } catch (error) {
    console.error('Fotoğraf getirme hatası:', error);
    res.status(500).json({ 
      error: 'Fotoğraflar getirilirken hata oluştu',
      details: error.message 
    });
  }
}