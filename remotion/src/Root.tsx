import { Composition } from 'remotion';
import { Explainer } from './Explainer';
import { CICDDemo } from './CICDDemo';
import { ProductDemo } from './ProductDemo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Explainer"
        component={Explainer}
        durationInFrames={1350}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="CICDDemo"
        component={CICDDemo}
        durationInFrames={600} // 20 seconds at 30fps
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="ProductDemo"
        component={ProductDemo}
        durationInFrames={1350}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
