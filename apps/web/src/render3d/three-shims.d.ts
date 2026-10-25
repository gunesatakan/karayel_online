/**
 * three.js kopyasinin (apps/web/vendor/three) kaba turleri.
 *
 * `@types/three` npm'den eklenemiyor: kok kilit dosyasi degisirse sunucu yayini
 * tetikleniyor (vendor/three/README.md). Katman yalnizca birkac sinif kullaniyor;
 * burada onlar `any` olarak bildiriliyor, ayni ad hem deger hem tur.
 */
declare module "three" {
  export const WebGLRenderer: any; export type WebGLRenderer = any;
  export const Scene: any; export type Scene = any;
  export const PMREMGenerator: any;
  export const HemisphereLight: any;
  export const DirectionalLight: any;
  export const OrthographicCamera: any; export type OrthographicCamera = any;
  export const PerspectiveCamera: any; export type PerspectiveCamera = any;
  export const Fog: any;
  export const Object3D: any; export type Object3D = any;
  export const Mesh: any; export type Mesh = any;
  export const Texture: any; export type Texture = any;
  export const CanvasTexture: any; export type CanvasTexture = any;
  export const PlaneGeometry: any;
  export const MeshBasicMaterial: any;
  export const ShaderMaterial: any; export type ShaderMaterial = any;
  export const CircleGeometry: any;
  export const TorusGeometry: any;
  export const BoxGeometry: any;
  export const OctahedronGeometry: any;
  export const Group: any;
  export const ShadowMaterial: any;
  export const MeshStandardMaterial: any;
  export const Sprite: any;
  export const SpriteMaterial: any;
  export const BufferGeometry: any; export type BufferGeometry = any;
  export const Float32BufferAttribute: any;
  export const RepeatWrapping: number;
  export const MirroredRepeatWrapping: number;
  export const TextureLoader: any;
  export const PCFShadowMap: number;
  export const Color: any;
  export const Vector2: any;
  export const Vector4: any;
  export const LinearFilter: number;
  export const CustomBlending: number;
  export const AddEquation: number;
  export const OneFactor: number;
  export const OneMinusSrcColorFactor: number;
  export const ACESFilmicToneMapping: number;
  export const SRGBColorSpace: string;
  // 3D vuruslar (shot-fx).
  export const Vector3: any; export type Vector3 = any;
  export const Quaternion: any; export type Quaternion = any;
  export const InstancedBufferGeometry: any; export type InstancedBufferGeometry = any;
  export const InstancedBufferAttribute: any; export type InstancedBufferAttribute = any;
  export const CylinderGeometry: any;
  export const ConeGeometry: any;
  export const SphereGeometry: any;
  export const IcosahedronGeometry: any;
  export type Material = any;
  export type MeshBasicMaterial = any;
  export type MeshStandardMaterial = any;
  export type Blending = number;
  export const AdditiveBlending: number;
  export const NormalBlending: number;
  export const DynamicDrawUsage: number;
  export const DoubleSide: number;
}

declare module "three/addons/loaders/GLTFLoader.js" {
  export const GLTFLoader: any;
}

declare module "three/addons/environments/RoomEnvironment.js" {
  export const RoomEnvironment: any;
}
