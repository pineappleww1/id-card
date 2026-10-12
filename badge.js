// 3D 吊牌：three.js 负责画，Rapier 负责物理（重力、挂绳拉扯、甩动）。
//
// 结构（从上到下）：
//   屏幕上方两个固定点 → 两股挂绳（各由几节小球用"绳子约束"连起来）
//   → 汇合点 → 金属扣 → 透明卡套（里面从前到后插着三页：正面、明信片、背面）
//
// 两种状态：
//   挂着（hang）：可以拖、可以甩。拖拽的做法是在你抓住的那个点上挂一根"看不见的弹簧"拉向鼠标，
//                所以抓卡片的角会让它绕着那个点转，松手时带着速度甩出去。
//   拆开（explode）：工具栏打开「卡套」时，卡片转到斜侧面，三页前后拉开，点哪页就选中哪页。

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PAGE_KINDS, drawPage, drawHolderFace, drawStrapWeave } from './card-texture.js';

// ---------- 尺寸（3D 世界里的单位，只看比例） ----------
const HOLDER = {
  w: 1.7,
  h: 2.72,
  depth: 0.026,
  radius: 0.1,
  holeX: 0.55, // 圆孔离中线的距离
  holeY: 0.15, // 圆孔离顶边的距离
  holeR: 0.062,
  slotY: 0.165, // 中间长孔离顶边的距离
  slotW: 0.4,
  slotH: 0.085,
  sealY: 0.27, // 封口线离顶边的距离
  sealH: 0.045,
};
const INSERT = { w: 1.49, h: 2.2, top: 0.42 }; // 三页的尺寸、离卡套顶边多远
const HOOK = 0.44; // 卡套顶边 → 挂绳汇合点
const STRAP = { width: 0.13, anchorX: 1.05, anchorY: 4.0, segments: 4, samples: 48 };
const JUNCTION_Y = 1.75; // 挂绳汇合点静止时的高度
const VIEW_TOP = 3.2; // 屏幕顶边在 3D 世界里的高度
const MIN_VIEW_H = 6.0; // 屏幕至少能看到多高
const FOV = 22;
const PAGE_PX = [1024, Math.round((1024 * INSERT.h) / INSERT.w)]; // 每页贴图的像素尺寸
const PAGE_THICK = 0.006; // 每页纸的厚度（拆开从侧面看才看得出来）

// ---------- 拆开时的样子 ----------
const EXPLODE = {
  yaw: -0.92, // 卡片转到斜侧面的角度（弧度，约 53°）
  // 每一页拆开后离原位多远，用卡片自己的方向：[左右, 上下, 前后]
  offset: { front: [0, 0.26, 1.1], postcard: [0, 0, 0], back: [0, -0.26, -1.1] },
  // 选中的那一页再往外浮一点
  lift: { front: [0, 0.16, 0.12], postcard: [0, 0.14, 0.5], back: [0, 0.16, -0.12] },
  dim: 0.82, // 没选中的页暗一点
};

// ---------- 手感参数 ----------
const STEP = 1 / 120; // 物理每步的时间
const SPRING = 140; // 拖拽弹簧的硬度
const SPRING_DAMP = 9; // 拖拽弹簧的阻尼
const MAX_PULL = 500;
const FACE_FRONT = 2.0; // 卡片自动转回正面的力度
const NO_COLLISION = 0x00010000; // 这里不需要碰撞，只要重力和绳子

export async function createBadge(container, feel) {
  await RAPIER.init();

  // ================= 渲染器 / 场景 / 相机 =================
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('这台设备不支持 WebGL，吊牌不显示', err);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // 左上方打来的光，负责在"纸面"上投出影子
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-3.6, 6, 9);
  sun.castShadow = true;
  // 手机屏幕小，影子贴图降一档，省点显卡
  const shadowSize = Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.radius = 7;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // 接影子的"纸面"：本身透明，只显示影子
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.13 }));
  floor.position.z = -0.65;
  floor.receiveShadow = true;
  scene.add(floor);

  // ================= 卡片模型 =================
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const toTexture = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };

  const card = new THREE.Group();
  scene.add(card);

  // 三页：每页是一张有一点厚度的纸。印着内容的那面朝外，另一面是素色纸背（明信片两面都印），
  // 四条边也是纸色。用不受灯光影响的材质，印刷颜色才不会被灯光冲淡；明暗在 sync() 里按朝向手动算一点
  const pageGeo = new THREE.BoxGeometry(INSERT.w, INSERT.h, PAGE_THICK);
  const insertY = HOLDER.h / 2 - INSERT.top - INSERT.h / 2;
  const pages = {};
  const pagePickables = [];
  PAGE_KINDS.forEach((kind, i) => {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = PAGE_PX;
    const texture = toTexture(canvas);
    const printed = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const plain = new THREE.MeshBasicMaterial({ toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ toneMapped: false });
    // BoxGeometry 六个面的顺序：右、左、上、下、前(+z)、后(-z)
    const sheet = new THREE.Mesh(pageGeo, [edge, edge, edge, edge, printed, kind === 'postcard' ? printed : plain]);
    sheet.castShadow = true;
    sheet.userData.kind = kind;
    const group = new THREE.Group();
    group.add(sheet);
    card.add(group);
    pagePickables.push(sheet);
    pages[kind] = {
      group,
      edge,
      canvas,
      texture,
      printed,
      plain,
      paper: new THREE.Color('#f5f5f3'),
      z: [0.007, 0, -0.007][i], // 合着时三页前后紧挨着
      flip: kind === 'back' ? Math.PI : 0, // 背面那页印的内容朝后
      lift: 0,
      dim: 1,
    };
  });

  // 透明卡套（带圆孔和长孔的圆角片）
  const holderGeo = new THREE.ExtrudeGeometry(holderShape(), {
    depth: HOLDER.depth,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 24,
  });
  holderGeo.translate(0, 0, -HOLDER.depth / 2);
  const holder = new THREE.Mesh(
    holderGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.07,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.3,
      depthWrite: false,
    }),
  );
  holder.castShadow = true;
  holder.renderOrder = 1;
  card.add(holder);

  // 卡套表面的线条细节（正反各一张）
  const faceTex = toTexture(drawHolderFace(512, Math.round((512 * HOLDER.h) / HOLDER.w), HOLDER));
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false });
  const faceGeo = new THREE.PlaneGeometry(HOLDER.w, HOLDER.h);
  const faceZ = HOLDER.depth / 2 + 0.008;
  const faceFront = new THREE.Mesh(faceGeo, faceMat);
  faceFront.position.z = faceZ;
  const faceBack = new THREE.Mesh(faceGeo, faceMat);
  faceBack.position.z = -faceZ;
  faceBack.rotation.y = Math.PI;
  faceFront.renderOrder = faceBack.renderOrder = 2;
  card.add(faceFront, faceBack);

  // 金属扣 + 挂绳折回来的那一小截
  const strapMat = new THREE.MeshStandardMaterial({
    color: feel.strapColor,
    roughness: 0.95,
    envMapIntensity: 0.08,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
  });
  const weave = toTexture(drawStrapWeave());
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  strapMat.map = weave;
  card.add(makeClasp(strapMat));

  const cardPickables = [holder, ...pagePickables];

  // ================= 物理 =================
  const world = new RAPIER.World({ x: 0, y: -feel.gravity, z: 0 });
  world.timestep = STEP;

  const body = (desc, collider) => {
    const b = world.createRigidBody(desc);
    world.createCollider(collider.setCollisionGroups(NO_COLLISION), b);
    return b;
  };
  const origin = { x: 0, y: 0, z: 0 };

  // 开场：整串东西从右上方掉下来，被绳子拽住后甩几下
  const junctionRest = new THREE.Vector3(0, JUNCTION_Y, 0);
  const start = junctionRest.clone().add(new THREE.Vector3(0.7, 1.6, 0));

  const junction = body(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setLinearDamping(1).setAngularDamping(2),
    RAPIER.ColliderDesc.ball(0.05).setMass(0.05),
  );

  // 竖屏手机上 V 字收窄一点，免得挂绳压住左上、右上的小字
  const anchorX = window.innerWidth / window.innerHeight < 0.75 ? 0.5 : STRAP.anchorX;
  const strands = [-1, 1].map((side) => {
    const anchorPos = new THREE.Vector3(side * anchorX, STRAP.anchorY, 0);
    const anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchorPos.x, anchorPos.y, 0));
    const segLen = anchorPos.distanceTo(junctionRest) / STRAP.segments;
    const bodies = [anchor];
    for (let i = 1; i < STRAP.segments; i++) {
      const p = anchorPos.clone().lerp(start, i / STRAP.segments);
      bodies.push(
        body(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(1.4).setAngularDamping(2),
          RAPIER.ColliderDesc.ball(0.04).setMass(0.03),
        ),
      );
    }
    bodies.push(junction);
    for (let i = 0; i < bodies.length - 1; i++) {
      world.createImpulseJoint(RAPIER.JointData.rope(segLen, origin, origin), bodies[i], bodies[i + 1], true);
    }
    const ribbon = makeRibbon(strapMat);
    scene.add(ribbon.mesh);
    return { bodies, ribbon };
  });

  const tilt = -0.35;
  const cardBody = body(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y - HOOK - HOLDER.h / 2, start.z)
      .setRotation({ x: 0, y: 0, z: Math.sin(tilt / 2), w: Math.cos(tilt / 2) })
      .setLinearDamping(0.8)
      .setAngularDamping(1.4),
    RAPIER.ColliderDesc.cuboid(HOLDER.w / 2, HOLDER.h / 2, 0.02).setMass(1),
  );
  const tipLocal = new THREE.Vector3(0, HOLDER.h / 2 + HOOK, 0);
  world.createImpulseJoint(RAPIER.JointData.spherical(origin, tipLocal), junction, cardBody, true);

  // ================= 挂着 / 拆开 两种状态 =================
  let mode = 'hang';
  let explode = 0; // 0 = 合着，1 = 完全拆开（中间平滑过渡）
  let poseT = 1; // 拆开时，卡片从当时的姿势转到斜侧面的进度
  let selected = null;
  let onPick = () => {};
  const enterPos = new THREE.Vector3();
  const enterRot = new THREE.Quaternion();
  const restPos = new THREE.Vector3(0, JUNCTION_Y - HOOK - HOLDER.h / 2, 0);
  const sideRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), EXPLODE.yaw);
  const ease = (t) => t * t * (3 - 2 * t);

  // ================= 鼠标 / 手指 =================
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const drag = { active: false, local: new THREE.Vector3(), target: new THREE.Vector3(), plane: new THREE.Plane() };

  const setPointer = (x, y) => {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };
  const hitCard = () => raycaster.intersectObjects(cardPickables, false)[0];
  const hitPage = () => raycaster.intersectObjects(pagePickables, false)[0];
  // 点在工具栏上的不算点卡片
  const onUI = (e) => e.target instanceof Element && e.target.closest('[data-ui]');
  const spin = () => cardBody.applyTorqueImpulse({ x: 0, y: 2.4, z: 0 }, true);
  let lastPointerType = 'mouse';
  let lastTap = { t: 0, x: 0, y: 0 };

  window.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
    if (onUI(e)) return;
    setPointer(e.clientX, e.clientY);
    if (mode === 'explode') {
      const hit = hitPage();
      if (hit) {
        e.preventDefault();
        onPick(hit.object.userData.kind);
      }
      return;
    }
    const hit = hitCard();
    if (!hit) return;
    e.preventDefault();
    // 手机上没有"双击"，连着点两下卡片就当成双击
    const now = performance.now();
    if (e.pointerType !== 'mouse' && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      spin();
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    card.updateMatrixWorld();
    drag.active = true;
    drag.local.copy(card.worldToLocal(hit.point.clone()));
    drag.plane.set(new THREE.Vector3(0, 0, 1), -hit.point.z);
    drag.target.copy(hit.point);
    cardBody.wakeUp();
    document.body.style.cursor = 'grabbing';
  });
  window.addEventListener('pointermove', (e) => {
    setPointer(e.clientX, e.clientY);
    if (drag.active) raycaster.ray.intersectPlane(drag.plane, drag.target);
    else if (onUI(e)) document.body.style.cursor = '';
    else if (mode === 'explode') document.body.style.cursor = hitPage() ? 'pointer' : '';
    else document.body.style.cursor = hitCard() ? 'grab' : '';
  });
  const release = () => {
    if (!drag.active) return;
    drag.active = false;
    document.body.style.cursor = '';
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  // 双击卡片：转一圈，看看背面（手指点的在上面 pointerdown 里处理了）
  window.addEventListener('dblclick', (e) => {
    if (mode !== 'hang' || onUI(e) || lastPointerType !== 'mouse') return;
    setPointer(e.clientX, e.clientY);
    if (hitCard()) spin();
  });

  // ================= 每一步物理之前 =================
  // 挂着：加拖拽力、让卡片慢慢转回正面；拆开：由程序把卡片摆到斜侧面
  const q = new THREE.Quaternion();
  const center = new THREE.Vector3();
  const grab = new THREE.Vector3();
  const arm = new THREE.Vector3();
  const pull = new THREE.Vector3();
  const pointVel = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const towardViewer = new THREE.Vector3(0, 0, 1);
  const posePos = new THREE.Vector3();
  const poseRot = new THREE.Quaternion();

  function beforeStep(dt) {
    if (mode === 'explode') {
      const s = ease(poseT);
      posePos.lerpVectors(enterPos, restPos, s);
      poseRot.slerpQuaternions(enterRot, sideRot, s);
      cardBody.setNextKinematicTranslation(posePos);
      cardBody.setNextKinematicRotation(poseRot);
      return;
    }

    const r = cardBody.rotation();
    q.set(r.x, r.y, r.z, r.w);

    facing.set(0, 0, 1).applyQuaternion(q).cross(towardViewer).multiplyScalar(FACE_FRONT * dt);
    cardBody.applyTorqueImpulse({ x: facing.x, y: facing.y, z: 0 }, false);

    if (!drag.active) return;
    const t = cardBody.translation();
    const lv = cardBody.linvel();
    const av = cardBody.angvel();
    center.set(t.x, t.y, t.z);
    arm.copy(drag.local).applyQuaternion(q);
    grab.copy(center).add(arm);
    pointVel.set(av.x, av.y, av.z).cross(arm).add(pull.set(lv.x, lv.y, lv.z));
    pull.subVectors(drag.target, grab).multiplyScalar(SPRING).addScaledVector(pointVel, -SPRING_DAMP);
    if (pull.length() > MAX_PULL) pull.setLength(MAX_PULL);
    pull.multiplyScalar(dt);
    cardBody.applyImpulseAtPoint({ x: pull.x, y: pull.y, z: pull.z }, { x: grab.x, y: grab.y, z: grab.z }, true);
  }

  // ================= 每一帧：拆开/选中的过渡、镜头移动 =================
  let dirty = true; // 有东西变了、需要重画一帧
  const view = { h: MIN_VIEW_H, camY: 0 }; // 平时的镜头：能看到多高、对准哪里
  const inset = { right: 0, bottom: 0 }; // 被工具栏面板挡住的那部分屏幕（像素）
  const cam = { x: 0, y: 0, h: MIN_VIEW_H }; // 镜头当前的位置和"能看到多高"（平滑地追向目标）
  const CARD_CENTER_Y = JUNCTION_Y - HOOK - HOLDER.h / 2;

  // 面板挡住一部分屏幕时，镜头该怎么摆
  function cameraTarget() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (inset.bottom > 0) {
      // 手机：面板从下面弹出来。镜头拉远一点、对准卡片中间，让卡片完整待在上面露出来的那块
      const visible = Math.max(120, H - inset.bottom);
      const exploded = mode === 'explode';
      const perPx = Math.max((exploded ? 4.6 : 4.0) / visible, (exploded ? 3.9 : 2.4) / W, view.h / H);
      return { x: 0, y: CARD_CENTER_Y - (inset.bottom / 2) * perPx, h: perPx * H };
    }
    // 电脑：面板在右边，镜头往右挪，卡片就待在左边空着的地方
    return { x: (inset.right / 2) * (view.h / H), y: view.camY, h: view.h };
  }

  function animate(dt) {
    const k = 1 - Math.exp(-dt * 6);
    explode += ((mode === 'explode' ? 1 : 0) - explode) * k;
    if (mode === 'explode') poseT += (1 - poseT) * k;
    for (const kind of PAGE_KINDS) {
      const p = pages[kind];
      const on = mode === 'explode' && selected === kind;
      p.lift += ((on ? 1 : 0) - p.lift) * k;
      p.dim += ((mode === 'explode' && selected && !on ? EXPLODE.dim : 1) - p.dim) * k;
    }
    const target = cameraTarget();
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    cam.h += (target.h - cam.h) * k;
    placeCamera();
  }

  function placeCamera() {
    const dist = cam.h / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.position.set(cam.x, cam.y, dist);
    camera.lookAt(cam.x, cam.y, 0);
  }

  // ================= 把物理结果同步到画面 =================
  const tip = new THREE.Vector3();
  const dir = new THREE.Vector3();
  function sync() {
    const t = cardBody.translation();
    const r = cardBody.rotation();
    card.position.set(t.x, t.y, t.z);
    card.quaternion.set(r.x, r.y, r.z, r.w);

    const e = ease(explode);
    floor.position.z = -0.65 - 1.8 * e; // 拆开时接影子的纸面往后退，别挡住退到后面的背面那页
    for (const kind of PAGE_KINDS) {
      const p = pages[kind];
      const [ox, oy, oz] = EXPLODE.offset[kind];
      const [lx, ly, lz] = EXPLODE.lift[kind];
      p.group.position.set(ox * e + lx * p.lift, insertY + oy * e + ly * p.lift, p.z + oz * e + lz * p.lift);
      p.group.rotation.y = p.flip * (1 - e); // 背面那页拆开时翻过来，让印的内容朝向你
    }
    card.updateMatrixWorld();
    tip.copy(tipLocal).applyMatrix4(card.matrixWorld);

    // 朝向镜头的面亮一点、转开的暗一点，假装有光
    for (const kind of PAGE_KINDS) {
      const p = pages[kind];
      p.group.getWorldDirection(dir); // 印着内容那一面的朝向
      p.printed.color.setScalar((0.8 + 0.2 * Math.max(0, dir.z)) * p.dim);
      p.plain.color.copy(p.paper).multiplyScalar((0.76 + 0.18 * Math.max(0, -dir.z)) * p.dim);
      p.edge.color.copy(p.paper).multiplyScalar(0.86 * p.dim);
    }

    for (const { bodies, ribbon } of strands) {
      for (let i = 0; i < bodies.length - 1; i++) {
        const p = bodies[i].translation();
        ribbon.points[i].set(p.x, p.y, p.z);
      }
      ribbon.points[bodies.length - 1].copy(tip);
      ribbon.update();
    }
  }

  // ================= 尺寸自适应 =================
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    renderer.setSize(w, h, false);
    // 竖屏手机上把镜头拉远一点，免得卡片太大、把底部的大名字整个盖住
    view.h = Math.max(aspect < 0.75 ? 7 : MIN_VIEW_H, HOLDER.w / 0.52 / aspect);
    view.camY = VIEW_TOP - view.h / 2;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    Object.assign(cam, cameraTarget());
    placeCamera();
    dirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  function advance(dt) {
    animate(dt);
    beforeStep(STEP);
    world.step();
  }

  // 开发时调试用：在控制台里手动推进，不受页面是否可见影响
  if (import.meta.env.DEV) {
    window.__badge = {
      cardBody,
      drag,
      stepFor(seconds) {
        for (let i = 0; i < Math.round(seconds / STEP); i++) advance(STEP);
        sync();
        renderer.render(scene, camera);
      },
    };
  }

  // ================= 主循环 =================
  // 卡片停稳、没人碰、也没有动画在走的时候，就不再每帧重画（手机上省电）
  let stillFrames = 0;
  const isStill = () => {
    if (mode !== 'hang' || drag.active || explode > 0.001 || !cardBody.isSleeping()) return false;
    const t = cameraTarget();
    return Math.abs(t.x - cam.x) + Math.abs(t.y - cam.y) + Math.abs(t.h - cam.h) < 1e-4;
  };
  let last = performance.now();
  let acc = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    animate(dt);
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) {
      beforeStep(STEP);
      world.step();
      acc -= STEP;
      n++;
    }
    stillFrames = isStill() && !dirty ? stillFrames + 1 : 0;
    if (stillFrames > 2) return;
    dirty = false;
    sync();
    renderer.render(scene, camera);
  });

  // ================= 给工具栏用的接口 =================
  return {
    // 重画某一页（content：名字等文字；page：{ template, bg }；image：加载好的图片或 null）
    setPage(kind, content, page, image) {
      const p = pages[kind];
      drawPage(p.canvas, kind, content, page, image);
      p.texture.needsUpdate = true;
      p.paper.set(page.bg);
      dirty = true;
    },
    setStrapColor(color) {
      strapMat.color.set(color);
      dirty = true;
    },
    setExplode(on) {
      if (on === (mode === 'explode')) return;
      if (on) {
        release();
        const t = cardBody.translation();
        const r = cardBody.rotation();
        enterPos.set(t.x, t.y, t.z);
        enterRot.set(r.x, r.y, r.z, r.w);
        poseT = 0;
        cardBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        mode = 'explode';
      } else {
        mode = 'hang';
        selected = null;
        cardBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        cardBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        cardBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    select(kind) {
      selected = kind;
      dirty = true;
    },
    onPick(fn) {
      onPick = fn;
    },
    // 告诉 3D 场景：屏幕右边/下边有多少像素被面板挡住了
    setViewInset({ right = 0, bottom = 0 } = {}) {
      inset.right = right;
      inset.bottom = bottom;
      dirty = true;
    },
    // 屏幕上这个点有没有点到卡片（拆开时只算三页）
    hits(x, y) {
      setPointer(x, y);
      return Boolean(mode === 'explode' ? hitPage() : hitCard());
    },
  };
}

// ---------- 卡套外形：圆角矩形，挖两个圆孔 + 一个长孔 ----------
function holderShape() {
  const { w, h, radius: r } = HOLDER;
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);

  for (const side of [-1, 1]) {
    const hole = new THREE.Path();
    hole.absarc(side * HOLDER.holeX, h / 2 - HOLDER.holeY, HOLDER.holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const slot = new THREE.Path();
  const end = HOLDER.slotW / 2 - HOLDER.slotH / 2;
  const cy = h / 2 - HOLDER.slotY;
  slot.absarc(end, cy, HOLDER.slotH / 2, -Math.PI / 2, Math.PI / 2, false);
  slot.absarc(-end, cy, HOLDER.slotH / 2, Math.PI / 2, Math.PI * 1.5, false);
  slot.closePath();
  s.holes.push(slot);
  return s;
}

// ---------- 金属扣：穿过长孔的小环 + 转轴 + D 形环 + 挂绳折回的一截 ----------
function makeClasp(strapMat) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.26 });
  const top = HOLDER.h / 2;
  const add = (geo, mat, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(new THREE.TorusGeometry(0.055, 0.012, 12, 32), metal, 0, top - HOLDER.slotY + 0.035, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.017, 0.017, 0.39, 12), metal, 0, top + 0.115, 0);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16), metal, 0, top + 0.17, 0);
  add(new THREE.TorusGeometry(0.06, 0.013, 12, 32), metal, 0, top + HOOK - 0.075, 0);
  add(new THREE.BoxGeometry(0.15, 0.09, 0.03), strapMat, 0, top + HOOK - 0.01, 0);
  return group;
}

// ---------- 挂绳：沿着几个物理节点画一条平平的织带 ----------
function makeRibbon(material) {
  const n = STRAP.samples;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 2 * 3);
  const nor = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const index = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(index);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const points = Array.from({ length: STRAP.segments + 1 }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const p = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const viewer = new THREE.Vector3(0, 0, 1);
  const half = STRAP.width / 2;

  function update() {
    let length = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      curve.getPoint(u, p);
      curve.getTangent(u, tangent);
      side.crossVectors(tangent, viewer);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize().multiplyScalar(half);
      normal.crossVectors(side, tangent).normalize();
      if (normal.z < 0) normal.negate();
      if (i > 0) length += p.distanceTo(prev);
      prev.copy(p);

      const k = i * 6;
      pos[k] = p.x - side.x;
      pos[k + 1] = p.y - side.y;
      pos[k + 2] = p.z - side.z;
      pos[k + 3] = p.x + side.x;
      pos[k + 4] = p.y + side.y;
      pos[k + 5] = p.z + side.z;
      for (let j = 0; j < 2; j++) {
        nor[k + j * 3] = normal.x;
        nor[k + j * 3 + 1] = normal.y;
        nor[k + j * 3 + 2] = normal.z;
      }
      const v = length / 0.35;
      uv[i * 4] = 0;
      uv[i * 4 + 1] = v;
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = v;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
  }

  return { mesh, points, update };
}
