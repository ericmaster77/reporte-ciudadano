// functions/index.js
// Cloud Functions para funcionalidades avanzadas (opcional)

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// 1. Generar estadísticas automáticas cada hora
exports.actualizarEstadisticas = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const reportesSnapshot = await db.collection('reportes').get();
      const reportes = reportesSnapshot.docs.map(doc => doc.data());

      const stats = {
        total: reportes.length,
        porSeveridad: {
          alta: reportes.filter(r => r.severidad === 'alta').length,
          media: reportes.filter(r => r.severidad === 'media').length,
          baja: reportes.filter(r => r.severidad === 'baja').length
        },
        porZona: {},
        porEstado: {
          pendiente: reportes.filter(r => r.estado === 'pendiente').length,
          en_revision: reportes.filter(r => r.estado === 'en_revision').length,
          resuelto: reportes.filter(r => r.estado === 'resuelto').length
        },
        ultimaActualizacion: admin.firestore.FieldValue.serverTimestamp()
      };

      // Calcular por zona
      const zonas = ['Centro', 'Norte', 'Sur', 'Este', 'Oeste', 'Periferia'];
      zonas.forEach(zona => {
        stats.porZona[zona] = reportes.filter(r => r.zona === zona).length;
      });

      await db.collection('estadisticas').doc('general').set(stats);
      console.log('Estadísticas actualizadas exitosamente');
      return null;
    } catch (error) {
      console.error('Error actualizando estadísticas:', error);
      throw error;
    }
  });

// 2. Trigger cuando se crea un nuevo reporte
exports.onNuevoReporte = functions.firestore
  .document('reportes/{reporteId}')
  .onCreate(async (snap, context) => {
    const reporte = snap.data();
    const reporteId = context.params.reporteId;

    console.log(`Nuevo reporte creado: ${reporteId}`);
    console.log(`Ubicación: ${reporte.ubicacion}`);
    console.log(`Severidad: ${reporte.severidad}`);

    // Aquí puedes agregar:
    // - Enviar notificaciones push
    // - Enviar email a autoridades
    // - Crear ticket en sistema municipal
    // - Actualizar dashboard en tiempo real

    // Ejemplo: Si es severidad alta, notificar inmediatamente
    if (reporte.severidad === 'alta') {
      console.log('⚠️ ALERTA: Bache de alta severidad reportado');
      
      // Aquí integrarías con servicio de notificaciones
      // Por ejemplo, SendGrid, Twilio, Firebase Cloud Messaging, etc.
    }

    return null;
  });

// 3. API REST para obtener reportes (pública)
exports.api = functions.https.onRequest(async (req, res) => {
  // Configurar CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const path = req.path;
  const method = req.method;

  try {
    // GET /api/reportes - Obtener todos los reportes
    if (path === '/reportes' && method === 'GET') {
      const zona = req.query.zona;
      const severidad = req.query.severidad;
      
      let query = db.collection('reportes');
      
      if (zona) {
        query = query.where('zona', '==', zona);
      }
      if (severidad) {
        query = query.where('severidad', '==', severidad);
      }
      
      const snapshot = await query.get();
      const reportes = [];
      
      snapshot.forEach(doc => {
        reportes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      res.json({
        success: true,
        count: reportes.length,
        data: reportes
      });
      return;
    }

    // GET /api/estadisticas - Obtener estadísticas
    if (path === '/estadisticas' && method === 'GET') {
      const statsDoc = await db.collection('estadisticas').doc('general').get();
      
      if (!statsDoc.exists) {
        res.status(404).json({
          success: false,
          message: 'Estadísticas no disponibles'
        });
        return;
      }

      res.json({
        success: true,
        data: statsDoc.data()
      });
      return;
    }

    // GET /api/geojson - Exportar en formato GeoJSON
    if (path === '/geojson' && method === 'GET') {
      const snapshot = await db.collection('reportes').get();
      const features = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [data.lng, data.lat]
          },
          properties: {
            id: doc.id,
            ubicacion: data.ubicacion,
            descripcion: data.descripcion,
            severidad: data.severidad,
            zona: data.zona,
            fecha: data.fecha,
            estado: data.estado,
            fotoURL: data.fotoURL || null
          }
        });
      });

      const geojson = {
        type: 'FeatureCollection',
        features: features
      };

      res.json(geojson);
      return;
    }

    // GET /api/zonas/:zona - Obtener reportes de una zona específica
    if (path.startsWith('/zonas/') && method === 'GET') {
      const zona = path.split('/')[2];
      const snapshot = await db.collection('reportes')
        .where('zona', '==', zona)
        .get();
      
      const reportes = [];
      snapshot.forEach(doc => {
        reportes.push({ id: doc.id, ...doc.data() });
      });

      res.json({
        success: true,
        zona: zona,
        count: reportes.length,
        data: reportes
      });
      return;
    }

    // Ruta no encontrada
    res.status(404).json({
      success: false,
      message: 'Endpoint no encontrado'
    });

  } catch (error) {
    console.error('Error en API:', error);
    res.status(500).json({
      success: false,
      message: 'Error del servidor',
      error: error.message
    });
  }
});

// 4. Limpiar imágenes huérfanas (sin reporte asociado)
exports.limpiarImagenesHuerfanas = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const [files] = await storage.bucket().getFiles({ prefix: 'baches/' });
      const reportesSnapshot = await db.collection('reportes').get();
      
      const fotoURLsEnUso = new Set();
      reportesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.fotoURL) {
          fotoURLsEnUso.add(data.fotoURL);
        }
      });

      let eliminadas = 0;
      for (const file of files) {
        const fileURL = await file.getSignedUrl({
          action: 'read',
          expires: '03-01-2500'
        });

        if (!fotoURLsEnUso.has(fileURL[0])) {
          await file.delete();
          eliminadas++;
          console.log(`Imagen huérfana eliminada: ${file.name}`);
        }
      }

      console.log(`Limpieza completada. ${eliminadas} imágenes eliminadas.`);
      return null;
    } catch (error) {
      console.error('Error en limpieza:', error);
      throw error;
    }
  });

// 5. Webhook para integración con gobierno municipal
exports.webhookMunicipal = functions.https.onRequest(async (req, res) => {
  // Validar autenticación (en producción usar API key o JWT)
  const apiKey = req.headers['x-api-key'];
  
  // En producción, validar contra Firebase Config o Secret Manager
  // if (apiKey !== functions.config().municipal.api_key) {
  //   res.status(401).json({ error: 'No autorizado' });
  //   return;
  // }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const { reporteId, nuevoEstado } = req.body;

    if (!reporteId || !nuevoEstado) {
      res.status(400).json({ 
        error: 'Faltan parámetros requeridos: reporteId, nuevoEstado' 
      });
      return;
    }

    // Actualizar estado del reporte
    await db.collection('reportes').doc(reporteId).update({
      estado: nuevoEstado,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      actualizadoPor: 'sistema_municipal'
    });

    console.log(`Reporte ${reporteId} actualizado a estado: ${nuevoEstado}`);

    res.json({
      success: true,
      message: 'Estado actualizado correctamente',
      reporteId: reporteId,
      nuevoEstado: nuevoEstado
    });

  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 6. Generar reporte PDF semanal (requiere biblioteca adicional)
exports.generarReporteSemanal = functions.pubsub
  .schedule('every monday 09:00')
  .timeZone('America/Mexico_City')
  .onRun(async (context) => {
    try {
      // Obtener reportes de la última semana
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);

      const snapshot = await db.collection('reportes')
        .where('fecha', '>=', hace7dias.toISOString())
        .get();

      const reportes = [];
      snapshot.forEach(doc => {
        reportes.push(doc.data());
      });

      console.log(`Reportes de la última semana: ${reportes.length}`);

      // Aquí integrarías generación de PDF con bibliotecas como PDFKit
      // y envío por email a autoridades municipales

      // Por ahora, solo guardamos un resumen
      const resumen = {
        periodo: {
          inicio: hace7dias.toISOString(),
          fin: new Date().toISOString()
        },
        totalReportes: reportes.length,
        porSeveridad: {
          alta: reportes.filter(r => r.severidad === 'alta').length,
          media: reportes.filter(r => r.severidad === 'media').length,
          baja: reportes.filter(r => r.severidad === 'baja').length
        },
        zonasMasAfectadas: {} // Calcular aquí
      };

      await db.collection('reportes_semanales').add(resumen);
      console.log('Reporte semanal generado');

      return null;
    } catch (error) {
      console.error('Error generando reporte semanal:', error);
      throw error;
    }
  });

// 7. Validar y comprimir imágenes al subirlas
exports.procesarImagen = functions.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    
    // Solo procesar imágenes de baches
    if (!filePath.startsWith('baches/')) {
      return null;
    }

    console.log(`Nueva imagen subida: ${filePath}`);
    
    // Aquí podrías:
    // - Generar thumbnails con Sharp
    // - Comprimir imágenes grandes
    // - Detectar contenido inapropiado con Vision API
    // - Extraer metadata EXIF (ubicación, fecha)

    return null;
  });

// Para desplegar estas funciones:
// 1. Instalar dependencias: cd functions && npm install
// 2. Desplegar: firebase deploy --only functions