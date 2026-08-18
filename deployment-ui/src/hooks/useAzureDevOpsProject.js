import { useContext } from "react";
import { AzureDevOpsProjectContext } from "../context/AzureDevOpsProjectContext";

export default function useAzureDevOpsProject() {

    return useContext(AzureDevOpsProjectContext);

}
