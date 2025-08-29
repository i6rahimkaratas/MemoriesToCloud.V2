const { IncomingForm } = require('formidable');
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST metodu destekleniyor' });
  }

  try {
    // Formidable ile dosya parse etme
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Parse error:', err);
        return res.status(400).json({ error: 'Dosya parse hatası' });
      }

      if (!files.file) {
        return res.status(400).json({ error: 'Dosya bulunamadı' });
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      
      // Dosya tipini kontrol et
      const allowedTypes = ['image/', 'video/'];
      const isAllowedType = allowedTypes.some(type => file.mimetype.startsWith(type));
      
      if (!isAllowedType) {
        return res.status(400).json({ error: 'Sadece resim ve video dosyaları destekleniyor' });
      }

      // Cloudinary'e yükle
      const uploadResult = await cloudinary.uploader.upload(file.filepath, {
        resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
        folder: 'photo-uploader', // Cloudinary'de klasör adı
        use_filename: true,
        unique_filename: true,
      });

      // Başarılı yanıt
      res.status(200).json({
        success: true,
        message: 'Dosya başarıyla yüklendi!',
        data: {
          id: uploadResult.public_id,
          url: uploadResult.secure_url,
          originalName: file.originalFilename,
          size: file.size,
          type: file.mimetype,
          uploadDate: new Date().toISOString()
        }
      });
    });

  } catch (error) {
    console.error('Yükleme hatası:', error);
    res.status(500).json({ 
      error: 'Dosya yüklenirken hata oluştu',
      details: error.message 
    });
  }
}