const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// AWS S3 yapılandırması
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

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
    console.log('Upload request received for AWS S3');
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

    // User ID'yi al
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

    // Dosya adını güvenli hale getir ve unique yap
    const fileExtension = file.originalFilename.split('.').pop();
    const safeFileName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `${Date.now()}_${uuidv4().slice(0, 8)}_${safeFileName}`;
    
    // S3 yükleme parametreleri
    const s3Key = `memories-to-cloud/${userId}/${uniqueFileName}`;
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: file.data,
      ContentType: file.mimetype,
      ACL: 'public-read', // Dosyaları herkese açık yap
      Metadata: {
        'original-name': file.originalFilename,
        'user-id': userId,
        'upload-date': new Date().toISOString(),
        'file-size': file.size.toString()
      }
    };

    console.log('Uploading to AWS S3...');
    console.log('S3 Key:', s3Key);
    
    // S3'e yükle
    const uploadResult = await s3.upload(uploadParams).promise();
    
    console.log('S3 Upload successful:', uploadResult.Key);
    console.log('S3 URL:', uploadResult.Location);

    // Başarılı yanıt
    res.status(200).json({
      success: true,
      message: 'Dosya başarıyla AWS S3\'e yüklendi!',
      data: {
        id: uploadResult.Key,
        url: uploadResult.Location,
        originalName: file.originalFilename,
        size: file.size,
        type: file.mimetype,
        uploadDate: new Date().toISOString(),
        userId: userId,
        storage: 'aws-s3' // Hangi serviste olduğunu belirt
      }
    });

  } catch (error) {
    console.error('S3 yükleme hatası:', error);
    res.status(500).json({ 
      error: 'Dosya AWS S3\'e yüklenirken hata oluştu',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}