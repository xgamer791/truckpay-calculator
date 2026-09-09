// Tesseract OSD reports the clockwise correction, not the input image's angle.
export function orientationDecision(data) {
  const degrees=data?.orientation_degrees,confidence=Number(data?.orientation_confidence)||0;
  const confident=[0,90,180,270].includes(degrees)&&confidence>=2;
  return {quarterTurns:confident?degrees/90:0,confident,confidence};
}
