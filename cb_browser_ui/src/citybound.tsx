import StackTrace from "stacktrace-js";

function displayError(prefix, error) {
    const el = document.getElementById("errors");
    el.className = "errorsHappened";

    StackTrace.fromError(error).then(stackFrames => {
        document.getElementById("errorsloading").className = "loaded";
        el.insertAdjacentHTML("beforeend", `<h2>${prefix}: ${error.message}</h2>`);
        for (let frame of stackFrames) {
            const fileName = frame.fileName.replace(window.location.origin, "");
            el.insertAdjacentHTML("beforeend", `${frame.functionName} in ${fileName} ${frame.lineNumber}:${frame.columnNumber}<br/>`)
        }
        el.insertAdjacentHTML("beforeend", '<br/>');
    }).catch(() => {
        document.getElementById("errorsloading").className = "loaded";
        el.insertAdjacentHTML("beforeend", `<h2>${prefix}: ${error.message}</h2>`);
        el.insertAdjacentHTML("beforeend", 'failed to gather error origin :(');
    });
}

window.onerror = function (msg, file, line, col, error) {
    displayError("Error", error || { message: msg });
};

window.addEventListener('unhandledrejection', function (e) {
    displayError("Unhandled Rejection", e.reason);
});

import Monet from 'monet';

if (process.env.NODE_ENV === 'production') {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject = function () { };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE = function () { };
}

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import ContainerDimensions from 'react-container-dimensions';
import update from 'immutability-helper';
import * as Camera from './camera/Camera';
import * as Planning from './planning_browser/Planning';
import * as Transport from './transport_browser/Transport';
import * as LandUse from './land_use_browser/LandUse';
import * as Households from './households_browser/Households';
import * as Vegetation from './vegetation_browser/Vegetation';
import * as Time from './time_browser/Time';
import * as Debug from './debug/Debug';
import * as Settings from './settings';
import * as Menu from './menu';
import * as Utils from './browser_utils/Utils';
import Stage from './stage/Stage';
import colors from './colors';

declare module '../target/wasm32-unknown-unknown/release/cb_browser_ui' {
    type Intent = {};

    export default interface CBRustAPI {
        start(): void;

        set_intent(projectId: string, gestureId: string, intent: Intent, doneAdding: boolean);

        move_gesture_point(projectId: string, gestureId: string, pointIdx: number, position: [number, number], doneMoving: boolean): void;
        start_new_gesture(projectId: string, gestureId: string, intent: Intent): void;
        with_control_point_added(intent: Intent, point: [number, number], addToEnd: boolean): Intent;
        insert_control_point(projectId: string, gestureId: string, point: [number, number], doneInserting: boolean);
        split_gesture(projectId: string, gestureId: string, point: [number, number], doneSplitting: boolean);
        set_n_lanes(projectId: string, gestureId: string, nLanesForward: number, nLanesBackward: number, doneChanging: boolean);
    }
}

type CBRustAPI = import('../target/wasm32-unknown-unknown/release/cb_browser_ui').default;

declare global {
    interface Window {
        update: typeof update;
        cbRustBrowser: CBRustAPI;
        __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
    }
}

export type SharedState = {
    planning: Planning.PlanningSharedState,
    transport: any,
    landUse: any,
    households: any,
    vegetation: any,
    debug: any,
    uiMode: any,
    system: {
        networkingTurns: string
    },
    rendering: {
        enabled: boolean
    },
    time: any,
    camera: any,

    menu: any,
    settings: any
}

export type SetSharedState = (updater: (oldState: SharedState) => SharedState) => void;

window.update = update;

import('../target/wasm32-unknown-unknown/release/cb_browser_ui').then(mod => mod.default as CBRustAPI).then(cbRustBrowser => {
    window.cbRustBrowser = cbRustBrowser;

    const settingSpecs = {
        camera: Camera.settingSpec,
        debug: Debug.settingsSpec,
        planning: Planning.settingsSpec,
        rendering: {
            retinaFactor: { default: 2, description: "Oversampling/Retina Factor", min: 0.5, max: 4.0, step: 0.1 }
        }
    };

    class CityboundReactApp extends React.Component {
        renderer: React.RefObject<Monet>;
        state: SharedState;
        boundSetState: SetSharedState;

        constructor(props) {
            super(props);

            this.state = {
                planning: Planning.initialState,
                transport: Transport.initialState,
                landUse: LandUse.initialState,
                households: Households.initialState,
                vegetation: Vegetation.initialState,
                debug: Debug.initialState,
                uiMode: null,
                system: {
                    networkingTurns: ""
                },
                rendering: {
                    enabled: true
                },
                time: Time.initialState,
                camera: Camera.initialState,

                menu: Menu.initalState,
                settings: Settings.loadSettings(settingSpecs)
            }

            this.renderer = React.createRef();
            this.boundSetState = this.setState.bind(this);
        }

        componentDidMount() {
            Camera.bindInputs(this.state, this.boundSetState);
            Debug.bindInputs(this.state, this.boundSetState);
            Planning.bindInputs(this.state, this.boundSetState);
        }

        onFrame() {
            if (this.state.rendering.enabled) {
                Camera.onFrame(this.state, this.boundSetState);
                this.renderer.current.renderFrame();
            }
        }

        render() {
            let layers = [];
            let interactive3Dshapes = [];

            return <div style={{ width: "100%", height: "100%" }}>
                <ContainerDimensions style={{ width: "100%", height: "100%", position: "relative" }}>{({ width, height }) =>
                    <Camera.Camera state={this.state} {... { width, height }}>
                        {({ project2dTo3d, project3dTo2d, view, perspective }) =>
                            <div style={{ width, height }}>
                                <div key="ui2dTools" className="ui2dTools" >
                                    <Planning.Tools state={this.state} setState={this.boundSetState} />
                                    <Menu.Tools state={this.state} setState={this.boundSetState} />
                                </div>
                                < div key="ui2d" className="ui2d" >
                                    <Time.Windows state={this.state} setState={this.boundSetState} />
                                    <Debug.Windows state={this.state} setState={this.boundSetState} />
                                    <Households.Windows state={this.state} setState={this.boundSetState} project3dTo2d={project3dTo2d} />
                                    <Menu.Windows state={this.state} setState={this.boundSetState} settingSpecs={settingSpecs} />
                                </div>

                                <Utils.Interactive3DContext.Provider value={interactive3Dshapes} >
                                    <Utils.RenderContext.Provider value={layers} >

                                        <Households.Shapes state={this.state} setState={this.boundSetState} />

                                        <Planning.ShapesAndLayers state={this.state} setState={this.boundSetState} />

                                        <LandUse.Layers state={this.state} />
                                        <Vegetation.Layers state={this.state} />
                                        <Transport.Layers state={this.state} />

                                    </Utils.RenderContext.Provider>
                                </Utils.Interactive3DContext.Provider>

                                <Monet key="canvas" ref={this.renderer}
                                    retinaFactor={this.state.settings.rendering.retinaFactor}
                                    clearColor={[...colors.grass, 1.0]}
                                    {... { layers, width, height, viewMatrix: view, perspectiveMatrix: perspective }} />

                                <Stage key="stage"
                                    requestedProjections={this.state.requestedProjections}
                                    style={{ width, height, position: "absolute", top: 0, left: 0 }}
                                    onWheel={e => {
                                        Camera.onWheel(e, this.state, this.boundSetState);
                                        e.preventDefault();
                                        return false;
                                    }}
                                    onMouseMove={e => {
                                        Camera.onMouseMove(e, this.state, this.boundSetState);
                                    }}
                                    {...{ interactables: interactive3Dshapes, width, height, project2dTo3d }}
                                />
                            </div>
                        }</Camera.Camera>
                }</ContainerDimensions>
            </div>;
        }
    }

    window.cbReactApp = ReactDOM.render(<CityboundReactApp />, document.getElementById('app'));

    cbRustBrowser.start();
});