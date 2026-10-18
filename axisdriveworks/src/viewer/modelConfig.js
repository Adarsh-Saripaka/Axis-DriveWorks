export const MODEL_MANIFEST = {
  "porsche_911": {
    paintParts: ["body_mesh", "hood", "door_L", "door_R"],
    wheelParts: ["rim_FL", "rim_FR", "rim_RL", "rim_RR"],
    exclusionParts: ["windshield", "window_glass"],
    scale: 1.0, 
  },
  "vantage": {
    paintParts: ["Object_0", "Object_1", "Object_2", "Object_3", "Object_4", "Object_5"],
    wheelParts: ["Object_34", "Object_35", "Object_36", "Object_37"],
    exclusionParts: ["GlassMtl", "GlassRed", "GlassAmber"],
    scale: 2.5
  },
  "audi_r8": {
    paintParts: ["Object_2", "Object_3", "Object_4", "Object_5", "Object_6", "Object_7"],
    wheelParts: ["Object_28", "Object_29"],
    exclusionParts: ["Meshpart63Mtl", "Meshpart64Mtl"],
    scale: 2.1
  },
  "audi_rs7": {
    paintParts: ["Car"],
    wheelParts: ["LeftWheelDisc", "RightWheelDisc"],
    exclusionParts: ["Glass", "GlassDark", "FLGlass", "BLGlass"],
    scale: 2.3
  },
  "bmw_m4": {
    paintParts: ["Body_Material #692_0", "Body_Material #694_0", "Body_Material #697_0", "Body_Material #698_0"],
    wheelParts: ["wheel_Material #751_0", "wheel_Material #752_0"],
    exclusionParts: ["glsslight_Material #161_0", "glsslight_Material #718_0"],
    scale: 2.2
  },
  "ferrari_488": {
    paintParts: ["Body", "Door_L", "Door_R", "Hood"],
    wheelParts: ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"],
    scale: 2.0
  },
  "honda_civic": {
    paintParts: ["Body", "Bumper_F", "Bumper_R"],
    wheelParts: ["Rim_FL", "Rim_FR", "Rim_RL", "Rim_RR"],
    scale: 2.2
  },
  "tesla_cyber": {
    paintParts: ["Body_Mesh", "Door_FL", "Door_FR", "Door_RL", "Door_RR"],
    wheelParts: ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"],
    scale: 2.4
  },
  "vw_golf": {
    paintParts: ["paint", "hoodcap"],
    wheelParts: ["tire"],
    exclusionParts: ["window"],
    scale: 1.8
  }
};

export const BODY_HINTS = /body|paint|carpaint|exterior|shell|metal/i;

export const smartMatchMaterial = (meshName, matName) => {
  const combined = `${meshName || ""} ${matName || ""}`;
  const name = combined.toLowerCase();
  
  const isPaint = BODY_HINTS.test(combined) || 
                  name.includes("car_exterior") ||
                  name === "material_0";

  const isWheel = (name.includes("wheel") || name.includes("rim") || name.includes("alloy")) && 
                  !name.includes("tire") && 
                  !name.includes("rubber");

  const isGlass = name.includes("glass") || 
                  name.includes("window") || 
                  name.includes("windshield") || 
                  name.includes("transparent");

  return { isPaint, isWheel, isGlass };
};
