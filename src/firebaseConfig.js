// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, updateDoc, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// Tu configuración de Firebase (obtén estos valores desde Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyAR5CWFKfHVRdTaFO8HLrP8t93oPQS_P9k",
  authDomain: "reporte-ciudadano-bd8c1.firebaseapp.com",
  projectId: "reporte-ciudadano-bd8c1",
  storageBucket: "reporte-ciudadano-bd8c1.firebasestorage.app",
  messagingSenderId: "353985545951",
  appId: "1:353985545951:web:b6f350193fea161a71cb6a"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Funciones para manejar reportes
export const reportesService = {
  // Crear nuevo reporte
  async crear(reporte) {
    try {
      let fotoURL = null;
      
      // Si hay foto, subirla a Storage
      if (reporte.foto) {
        const fotoRef = ref(storage, `baches/${Date.now()}_${reporte.id}.jpg`);
        const fotoBlob = await fetch(reporte.foto).then(r => r.blob());
        await uploadBytes(fotoRef, fotoBlob);
        fotoURL = await getDownloadURL(fotoRef);
      }

      // Guardar en Firestore
      const docRef = await addDoc(collection(db, 'reportes'), {
        ...reporte,
        fotoURL,
        foto: null, // No guardar base64 en Firestore
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return { id: docRef.id, success: true };
    } catch (error) {
      console.error('Error al crear reporte:', error);
      throw error;
    }
  },

  // Obtener todos los reportes
  async obtenerTodos() {
    try {
      const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'));
      const querySnapshot = await getDocs(q);
      const reportes = [];
      
      querySnapshot.forEach((doc) => {
        reportes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return reportes;
    } catch (error) {
      console.error('Error al obtener reportes:', error);
      throw error;
    }
  },

  // Obtener reportes por zona
  async obtenerPorZona(zona) {
    try {
      const q = query(
        collection(db, 'reportes'),
        where('zona', '==', zona),
        orderBy('fecha', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const reportes = [];
      
      querySnapshot.forEach((doc) => {
        reportes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return reportes;
    } catch (error) {
      console.error('Error al obtener reportes por zona:', error);
      throw error;
    }
  },

  // Obtener reportes por severidad
  async obtenerPorSeveridad(severidad) {
    try {
      const q = query(
        collection(db, 'reportes'),
        where('severidad', '==', severidad),
        orderBy('fecha', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const reportes = [];
      
      querySnapshot.forEach((doc) => {
        reportes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return reportes;
    } catch (error) {
      console.error('Error al obtener reportes por severidad:', error);
      throw error;
    }
  },

  // Actualizar estado de un reporte
  async actualizarEstado(reporteId, nuevoEstado) {
    try {
      const reporteRef = doc(db, 'reportes', reporteId);
      await updateDoc(reporteRef, {
        estado: nuevoEstado,
        updatedAt: new Date().toISOString()
      });
      return { success: true };
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      throw error;
    }
  },

  // Exportar a GeoJSON
  async exportarGeoJSON() {
    try {
      const reportes = await this.obtenerTodos();
      
      const geojson = {
        type: "FeatureCollection",
        features: reportes.map(reporte => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [reporte.lng, reporte.lat]
          },
          properties: {
            id: reporte.id,
            ubicacion: reporte.ubicacion,
            descripcion: reporte.descripcion,
            severidad: reporte.severidad,
            zona: reporte.zona,
            fecha: reporte.fecha,
            estado: reporte.estado,
            fotoURL: reporte.fotoURL || null
          }
        }))
      };

      return geojson;
    } catch (error) {
      console.error('Error al exportar GeoJSON:', error);
      throw error;
    }
  }
};

export { db, storage, auth };
export default app;