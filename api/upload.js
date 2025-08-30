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
    console.log('Upload request received');
    console.log('Content-Type:', req.headers['content-type']);
    
    // Multipart form data parser
    const parseMultipart = (req) => {
      return new Promise((resolve, reject) => {
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        if (!boundary) {
          reject(new Error('No boundary found'));
          return;
        }

        let data = '';
        req.setEncoding('binary');
        
        req.on('data', chunk => {
          data += chunk;
        });
        
        req.on('end', () => {
          const parts = data.split(`--${boundary}`);
          const files = {};
          const fields = {};
          
          for (const part of parts) {
            if (part.includes('Content-Disposition: form-data')) {
              const nameMatch = part.match(/name="([^"]+)"/);
              const filenameMatch = part.match(/filename="([^"]+)"/);
              const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
              
              if (nameMatch) {
                const name = nameMatch[1];
                
                if (filenameMatch && contentTypeMatch) {
                  // Bu bir dosya
                  const filename = filenameMatch[1];
                  const contentType = contentTypeMatch[1];
                  
                  const dataStart = part.indexOf('\r\n\r\n') + 4;
                  const fileData = part.substring(dataStart, part.lastIndexOf('\r\n'));
                  
                  files[name] = {
                    originalFilename: filename,
                    mimetype: contentType,
                    size: Buffer.byteLength(fileData, 'binary'),
                    data: Buffer.from(fileData, 'binary')
                  };
                } else {
                  // Bu bir form field
                  const dataStart = part.indexOf('\r\n\r\n') + 4;
                  const fieldValue = part.substring(dataStart, part.lastIndexOf('\r\n'));
                  fields[name] = fieldValue;
                }
              }
            }
          }
          
          resolve({ files, fields });
        });
        
        req.on('error', reject);
      });
    };

    const { files, fields } = await parseMultipart(req);
    console.log('Parsed files:', Object.keys(files));
    console.log('Parsed fields:', fields);
    
    if (!files.file) {
      return res.status(400).json({ error: 'Dosya bulunamadı' });
    }

    // User ID'yi al (frontend'den gönderilen)
    const userId = fields.userId || 'default-user';
    console.log('User ID:', userId);

    const file = files.file;
    console.log('File info:', {
      name: file.originalFilename,
      type: file.mimetype,
      size: file.size
    });
    
    // Dosya tipini kontrol et
    const allowedTypes = ['image/', 'video/'];
    const isAllowedType = allowedTypes.some(type => file.mimetype.startsWith(type));
    
    if (!isAllowedType) {
      return res.status(400).json({ error: 'Sadece resim ve video dosyaları destekleniyor' });
    }

    // Base64'e çevir ve Cloudinary'e yükle
    const base64Data = `data:${file.mimetype};base64,${file.data.toString('base64')}`;
    
    console.log('Uploading to Cloudinary...');
    const uploadResult = await cloudinary.uploader.upload(base64Data, {
      resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
      folder: `photo-uploader/${userId}`, // Kullanıcıya özel klasör
      use_filename: true,
      unique_filename: true,
    });

    console.log('Upload successful:', uploadResult.public_id);

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
        uploadDate: new Date().toISOString(),
        userId: userId
      }
    });

  } catch (error) {
    console.error('Yükleme hatası:', error);
    res.status(500).json({ 
      error: 'Dosya yüklenirken hata oluştu',
      details: error.message 
    });
  }
}